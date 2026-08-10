//! remove_admin (disc 2, 33 B): `config(w), …admins`. 2 distinct admin signers,
//! and `admin_count - 1 >= MIN_ADMINS_AFTER_REMOVE` (removal needs ≥4 registered).
//! Data: [1..33]=target_admin.

use {
    super::{addr_at, require_admins},
    crate::{
        constants::{MIN_ADMINS_AFTER_REMOVE, T_DESTRUCTIVE},
        error::CertifyError,
        state::config::ConfigMut,
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 33 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_DESTRUCTIVE)?;

    let target = addr_at(data, 1);
    let [config_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut cfg = ConfigMut::load_mut(config_acc, program_id)?;

    let remaining = cfg
        .admin_count()
        .checked_sub(1)
        .ok_or(CertifyError::Overflow)?;
    if remaining < MIN_ADMINS_AFTER_REMOVE {
        return Err(CertifyError::BelowMinAdmins.into());
    }
    cfg.swap_remove_admin(&target).map_err(ProgramError::from)
}
