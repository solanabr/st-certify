//! init_config (disc 0, 290 B): `payer(w,s), config(w), system`.
//! Data: [1..33]=notary, [33]=count, [34..290]=admins[8][32].
//!
//! §11: (1) exact 290 len (2) [C] virgin-check on config = reinit protection
//! (3) canonical bump found in-program (4) system-program CPI target checked
//! (7) payer signer + BOOTSTRAP_ADMIN genesis signer (9) checked count math.
//! First-caller-wins singleton, but the caller must hold the bootstrap key.

use {
    super::addr_at,
    crate::{
        constants::{seeds, MAX_ADMINS, MIN_ADMINS, ZERO_ADDRESS},
        error::CertifyError,
        load,
        state::config::{ConfigMut, LEN},
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

const DATA_LEN: usize = 290;

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != DATA_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Genesis gate: the hardcoded recovery key must authorize this one-shot init.
    // Without it the singleton is permissionless — a race winner could seed an
    // attacker-controlled notary + admin set (the forced bootstrap admin alone is
    // defeatable: 7 attacker admins can co-sign it out via remove_admin). The
    // bootstrap key may be any signer in the tx (typically also the payer).
    if !accounts
        .iter()
        .any(|a| a.is_signer() && a.address() == &crate::constants::BOOTSTRAP_ADMIN)
    {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let [payer, config_acc, system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    load::check_signer(payer)?;
    load::check_system_program(system)?;

    let notary = addr_at(data, 1);
    if notary == ZERO_ADDRESS {
        return Err(CertifyError::InvalidNotary.into());
    }
    let count = data[33] as usize;
    if count == 0 || count > MAX_ADMINS as usize {
        return Err(ProgramError::InvalidInstructionData);
    }

    // Collect the provided admins: nonzero, pairwise-distinct.
    let mut set = [ZERO_ADDRESS; MAX_ADMINS as usize];
    let mut n = 0usize;
    for i in 0..count {
        let a = addr_at(data, 34 + i * 32);
        if a == ZERO_ADDRESS {
            return Err(ProgramError::InvalidArgument);
        }
        if set[..n].contains(&a) {
            return Err(CertifyError::AdminAlreadyExists.into());
        }
        set[n] = a;
        n += 1;
    }

    // Force-include BOOTSTRAP_ADMIN (dedup). AdminListFull if it would overflow.
    if !set[..n].contains(&crate::constants::BOOTSTRAP_ADMIN) {
        if n >= MAX_ADMINS as usize {
            return Err(CertifyError::AdminListFull.into());
        }
        set[n] = crate::constants::BOOTSTRAP_ADMIN;
        n += 1;
    }

    // T_DESTRUCTIVE must be satisfiable from genesis.
    if (n as u8) < MIN_ADMINS {
        return Err(CertifyError::BelowMinAdmins.into());
    }

    // [C] create the singleton config PDA (reinit fails structurally here).
    let bump = load::create_pda(config_acc, payer, &[seeds::CONFIG], LEN, program_id)?;
    let mut cfg = ConfigMut::init(config_acc, bump)?;
    cfg.set_admin_count(n as u8);
    cfg.set_notary(&notary);
    for (i, admin) in set[..n].iter().enumerate() {
        cfg.set_admin_at(i, admin);
    }
    // editions_created stays 0 (account zeroed on create).
    Ok(())
}
