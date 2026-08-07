//! Shared account-safety primitives: `[L]` load gate, `[P]` stored-bump PDA
//! rederivation, `[C]` robust create, and secure close. Every handler is built
//! from these so the never-omit validation checklist (appendix §11) is enforced
//! uniformly, in one audited place.

use pinocchio::{
    account::{Ref, RefMut},
    cpi::Signer,
    error::ProgramError,
    sysvars::{rent::Rent, Sysvar},
    AccountView, Address, ProgramResult, Resize,
};
use pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer};

use crate::constants::{
    DISC_CERTIFICATE, DISC_CONFIG, DISC_EDITION, DISC_TOMBSTONE, ID, MAX_ADMINS, SEED_CERT,
    SEED_CONFIG, SEED_EDITION,
};
use crate::errors::CertifyError;
use crate::state::{certificate, config, edition};

/// `[L]` immutable load gate: owner (before any data branch) -> exact length ->
/// discriminator. The `disc` check rejects both the `0x00` virgin and the `0xFF`
/// tombstone. This is the only sanctioned path to a program account's bytes.
#[inline(always)]
pub fn load<'a>(acct: &'a AccountView, disc: u8, len: usize) -> Result<Ref<'a, [u8]>, ProgramError> {
    if !acct.owned_by(&ID) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = acct.try_borrow()?;
    if data.len() != len {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[0] != disc {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(data)
}

/// `[L]` mutable load gate (same checks as [`load`]).
#[inline(always)]
pub fn load_mut<'a>(
    acct: &'a mut AccountView,
    disc: u8,
    len: usize,
) -> Result<RefMut<'a, [u8]>, ProgramError> {
    if !acct.owned_by(&ID) {
        return Err(ProgramError::IncorrectProgramId);
    }
    let data = acct.try_borrow_mut()?;
    if data.len() != len {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[0] != disc {
        return Err(ProgramError::InvalidAccountData);
    }
    Ok(data)
}

/// `[P]` stored-bump rederivation: `create_program_address(seeds ‖ [bump]) == address`.
/// One deterministic 1.5k-CU syscall (no bump search). `seeds_with_bump` MUST already
/// include the stored bump as its last element; the bump is read from account data,
/// never from instruction data.
#[inline(always)]
pub fn verify_addr(acct: &AccountView, seeds_with_bump: &[&[u8]]) -> ProgramResult {
    let derived =
        Address::create_program_address(seeds_with_bump, &ID).map_err(|_| ProgramError::InvalidSeeds)?;
    if &derived != acct.address() {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

/// Canonical in-program derivation used ONLY at init paths. Finds the canonical
/// bump and asserts it lands on the passed account (clean error instead of an
/// opaque CPI failure). Client-supplied bumps are never consulted.
#[inline(always)]
pub fn find_and_check(seeds: &[&[u8]], acct: &AccountView) -> Result<u8, ProgramError> {
    let (addr, bump) = Address::find_program_address(seeds, &ID);
    if &addr != acct.address() {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(bump)
}

/// `[C]` robust create for a program-owned PDA.
///
/// Virgin check (system-owned AND empty) rejects re-init; a donated-lamports
/// (pre-funded) PDA is handled via the Transfer-topup + Allocate + Assign branch.
/// `signer` carries the PDA's full seeds (including the canonical bump). On return
/// the account is program-owned with `space` zeroed bytes; the caller writes disc,
/// bump and fields.
pub fn create_pda(
    payer: &AccountView,
    new_acct: &AccountView,
    space: usize,
    signer: &[Signer],
) -> ProgramResult {
    if !new_acct.owned_by(&pinocchio_system::ID) || new_acct.data_len() != 0 {
        return Err(CertifyError::AccountAlreadyInitialized.into());
    }

    let rent = Rent::get()?.try_minimum_balance(space)?;
    let current = new_acct.lamports();

    if current == 0 {
        CreateAccount {
            from: payer,
            to: new_acct,
            lamports: rent,
            space: space as u64,
            owner: &ID,
        }
        .invoke_signed(signer)?;
    } else {
        // Pre-funded PDA: top up from the payer (normal signer), then the PDA
        // signs its own Allocate + Assign.
        if current < rent {
            let topup = rent - current; // safe: current < rent
            Transfer {
                from: payer,
                to: new_acct,
                lamports: topup,
            }
            .invoke()?;
        }
        Allocate {
            account: new_acct,
            space: space as u64,
        }
        .invoke_signed(signer)?;
        Assign {
            account: new_acct,
            owner: &ID,
        }
        .invoke_signed(signer)?;
    }

    Ok(())
}

/// Secure close in the mandated order: tombstone `0xFF` -> drain lamports to
/// `dest` (checked) -> `resize(1)` -> `close()`. Prevents same-tx revival: any
/// later load sees `0xFF` (then, post-close, a non-program owner) and is rejected.
pub fn close_to(acct: &mut AccountView, dest: &mut AccountView) -> ProgramResult {
    {
        let mut data = acct.try_borrow_mut()?;
        data[0] = DISC_TOMBSTONE;
    }

    let amount = acct.lamports();
    let new_dest = dest
        .lamports()
        .checked_add(amount)
        .ok_or(CertifyError::Overflow)?;
    dest.set_lamports(new_dest);
    acct.set_lamports(0);

    acct.resize(1)?;
    acct.close()
}

/// Require a real transaction signature (payer / student / notary).
#[inline(always)]
pub fn require_signer(acct: &AccountView) -> ProgramResult {
    if !acct.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

/// Require an account to be the System Program (CPI target constant check).
#[inline(always)]
pub fn require_system_program(acct: &AccountView) -> ProgramResult {
    if acct.address() != &pinocchio_system::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Typed loaders — bundle `[L]` (owner/len/disc) with `[P]` (stored-bump rederive)
// per account type. Seeds for the rederive come from the account's own data, so
// the check is self-consistent.
// ---------------------------------------------------------------------------

/// Immutable [`config`] load: `[L]` + `[P]` on `[b"config"]`.
#[inline]
pub fn load_config<'a>(acct: &'a AccountView) -> Result<Ref<'a, [u8]>, ProgramError> {
    let data = load(acct, DISC_CONFIG, config::LEN)?;
    let bump = [config::bump(&data)];
    verify_addr(acct, &[SEED_CONFIG, &bump])?;
    Ok(data)
}

/// Mutable [`config`] load: validate immutably (`[L]` + `[P]`), then hand back a write guard.
#[inline]
pub fn load_config_mut<'a>(acct: &'a mut AccountView) -> Result<RefMut<'a, [u8]>, ProgramError> {
    check_config(acct)?;
    Ok(acct.try_borrow_mut()?)
}

/// Immutable [`edition`] load: `[L]` + `[P]` on `[b"edition", id_le]`.
#[inline]
pub fn load_edition<'a>(acct: &'a AccountView) -> Result<Ref<'a, [u8]>, ProgramError> {
    let data = load(acct, DISC_EDITION, edition::LEN)?;
    let id_le = edition::id(&data).to_le_bytes();
    let bump = [edition::bump(&data)];
    verify_addr(acct, &[SEED_EDITION, &id_le, &bump])?;
    Ok(data)
}

/// Mutable [`edition`] load.
#[inline]
pub fn load_edition_mut<'a>(acct: &'a mut AccountView) -> Result<RefMut<'a, [u8]>, ProgramError> {
    check_edition(acct)?;
    Ok(acct.try_borrow_mut()?)
}

/// Immutable [`certificate`] load: `[L]` + `[P]` on `[b"cert", edition, student]`
/// (seeds read from the certificate's own data — self-consistent).
#[inline]
pub fn load_cert<'a>(acct: &'a AccountView) -> Result<Ref<'a, [u8]>, ProgramError> {
    let data = load(acct, DISC_CERTIFICATE, certificate::LEN)?;
    let bump = [certificate::bump(&data)];
    verify_addr(
        acct,
        &[
            SEED_CERT,
            certificate::edition_slice(&data),
            certificate::student_slice(&data),
            &bump,
        ],
    )?;
    Ok(data)
}

/// Mutable [`certificate`] load.
#[inline]
pub fn load_cert_mut<'a>(acct: &'a mut AccountView) -> Result<RefMut<'a, [u8]>, ProgramError> {
    check_cert(acct)?;
    Ok(acct.try_borrow_mut()?)
}

#[inline]
fn check_config(acct: &AccountView) -> ProgramResult {
    let data = load(acct, DISC_CONFIG, config::LEN)?;
    let bump = [config::bump(&data)];
    verify_addr(acct, &[SEED_CONFIG, &bump])
}

#[inline]
fn check_edition(acct: &AccountView) -> ProgramResult {
    let data = load(acct, DISC_EDITION, edition::LEN)?;
    let id_le = edition::id(&data).to_le_bytes();
    let bump = [edition::bump(&data)];
    verify_addr(acct, &[SEED_EDITION, &id_le, &bump])
}

#[inline]
fn check_cert(acct: &AccountView) -> ProgramResult {
    let data = load(acct, DISC_CERTIFICATE, certificate::LEN)?;
    let bump = [certificate::bump(&data)];
    verify_addr(
        acct,
        &[
            SEED_CERT,
            certificate::edition_slice(&data),
            certificate::student_slice(&data),
            &bump,
        ],
    )
}

// ---------------------------------------------------------------------------
// Threshold: distinct admin-signer counting
// ---------------------------------------------------------------------------

/// Count distinct admin signers across the full account slice, deduped pairwise
/// by address. An account counts iff it `is_signer()` and its address is in
/// `admins[..admin_count]`; the same admin passed as two metas counts once.
/// `is_signer` flags are runtime-set and unforgeable. Returns 0..=admin_count.
pub fn count_admin_signers(config_data: &[u8], accounts: &[AccountView]) -> u8 {
    let admin_count = config::admin_count(config_data) as usize;
    let mut seen: [Address; MAX_ADMINS as usize] = [Address::default(); MAX_ADMINS as usize];
    let mut seen_len: usize = 0;
    let mut n: u8 = 0;

    for acct in accounts.iter() {
        if !acct.is_signer() {
            continue;
        }
        let addr = acct.address();

        let mut is_admin = false;
        let mut i = 0;
        while i < admin_count {
            if &config::admin(config_data, i) == addr {
                is_admin = true;
                break;
            }
            i += 1;
        }
        if !is_admin {
            continue;
        }

        let mut dup = false;
        let mut j = 0;
        while j < seen_len {
            if &seen[j] == addr {
                dup = true;
                break;
            }
            j += 1;
        }
        if dup {
            continue;
        }

        seen[seen_len] = *addr;
        seen_len += 1;
        n += 1;
    }

    n
}
