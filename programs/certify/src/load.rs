//! Shared account primitives.
//!
//! - **[L] load gate** (owner → exact length → discriminator → [P]): folded into
//!   the `load`/`load_mut` constructors on each state view (see [`crate::state`]).
//! - **[P] stored-bump rederivation**: also inside those constructors via
//!   `create_program_address(seeds ‖ [stored_bump]) == address`.
//! - **[C] robust create**: [`create_pda`] — virgin check, canonical
//!   `find_program_address` (client bumps NEVER read), rent, and the pre-funded
//!   Transfer/Allocate/Assign branch.
//! - **close**: [`close_to`] — tombstone → drain → resize(1) → close.
//!
//! Plus the standalone signer/writable/CPI-target checks handlers compose.

use {
    crate::error::CertifyError,
    pinocchio::{
        account::AccountView,
        cpi::{Seed, Signer},
        error::ProgramError,
        sysvars::{rent::Rent, Sysvar},
        Address, Resize,
    },
    pinocchio_system::instructions::{Allocate, Assign, CreateAccount, Transfer},
};

/// `is_signer` assertion for an authority account.
#[inline(always)]
pub fn check_signer(acc: &AccountView) -> Result<(), ProgramError> {
    if !acc.is_signer() {
        return Err(ProgramError::MissingRequiredSignature);
    }
    Ok(())
}

/// `is_writable` assertion for payers and lamport destinations.
#[inline(always)]
pub fn check_writable(acc: &AccountView) -> Result<(), ProgramError> {
    if !acc.is_writable() {
        return Err(ProgramError::InvalidArgument);
    }
    Ok(())
}

/// CPI target validation: the passed account is the System Program.
#[inline(always)]
pub fn check_system_program(acc: &AccountView) -> Result<(), ProgramError> {
    if acc.address() != &pinocchio_system::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    Ok(())
}

/// [C] Robust PDA creation. Returns the canonical bump (to be stored at offset 1).
///
/// `seeds` are the address seeds WITHOUT the bump (length 1..=3). The canonical
/// bump is found in-program — client-supplied bumps are never read, closing the
/// shadow-PDA forgery hole. Handles the pre-funded-PDA attack: a virgin account
/// carrying donated lamports is topped-up (if short) then Allocate+Assign'd
/// rather than CreateAccount'd (which would fail on a non-zero balance).
pub fn create_pda(
    target: &AccountView,
    payer: &AccountView,
    seeds: &[&[u8]],
    space: usize,
    program_id: &Address,
) -> Result<u8, ProgramError> {
    // [C] virgin check: system-owned AND empty, else reinit/revival attempt.
    if !target.owned_by(&pinocchio_system::ID) || !target.is_data_empty() {
        return Err(CertifyError::AccountAlreadyInitialized.into());
    }

    // Canonical bump, derived in-program; verify the client passed the true PDA.
    let (expected, bump) = Address::find_program_address(seeds, program_id);
    if &expected != target.address() {
        return Err(ProgramError::InvalidSeeds);
    }

    let needed = Rent::get()?.try_minimum_balance(space)?;
    let current = target.lamports();
    let bump_seed: [u8; 1] = [bump];

    // Build signer seeds (address seeds ‖ bump) on the stack; dispatch on arity.
    match seeds {
        [a] => create_inner(
            target,
            payer,
            needed,
            current,
            space,
            program_id,
            &[Seed::from(*a), Seed::from(&bump_seed)],
        ),
        [a, b] => create_inner(
            target,
            payer,
            needed,
            current,
            space,
            program_id,
            &[Seed::from(*a), Seed::from(*b), Seed::from(&bump_seed)],
        ),
        [a, b, c] => create_inner(
            target,
            payer,
            needed,
            current,
            space,
            program_id,
            &[
                Seed::from(*a),
                Seed::from(*b),
                Seed::from(*c),
                Seed::from(&bump_seed),
            ],
        ),
        _ => return Err(ProgramError::InvalidSeeds),
    }?;

    Ok(bump)
}

#[inline(always)]
fn create_inner(
    target: &AccountView,
    payer: &AccountView,
    needed: u64,
    current: u64,
    space: usize,
    program_id: &Address,
    seeds: &[Seed],
) -> Result<(), ProgramError> {
    let signers = [Signer::from(seeds)];

    if current == 0 {
        CreateAccount {
            from: payer,
            to: target,
            lamports: needed,
            space: space as u64,
            owner: program_id,
        }
        .invoke_signed(&signers)
    } else {
        // Pre-funded PDA: top up the rent shortfall (payer signs via the tx),
        // then allocate + assign under the PDA's own signature.
        if needed > current {
            Transfer {
                from: payer,
                to: target,
                lamports: needed - current,
            }
            .invoke()?;
        }
        Allocate {
            account: target,
            space: space as u64,
        }
        .invoke_signed(&signers)?;
        Assign {
            account: target,
            owner: program_id,
        }
        .invoke_signed(&signers)
    }
}

/// Close ordering (reject path): tombstone `0xFF` → drain lamports to `refund`
/// (checked) → resize to 1 byte → close. Blocks same-tx revival: post-close the
/// owner is zeroed, so [`create_pda`]'s virgin check rejects reuse.
pub fn close_to(acc: &mut AccountView, refund: &mut AccountView) -> Result<(), ProgramError> {
    // Tombstone first (scoped borrow released before resize/close).
    {
        let mut data = acc.try_borrow_mut()?;
        data[crate::state::DISC] = crate::constants::disc::TOMBSTONE;
    }

    // Drain lamports to the refund target (checked add).
    let amount = acc.lamports();
    let new_refund = refund
        .lamports()
        .checked_add(amount)
        .ok_or(CertifyError::Overflow)?;
    refund.set_lamports(new_refund);
    acc.set_lamports(0);

    // Shrink then close.
    acc.resize(1)?;
    acc.close()
}
