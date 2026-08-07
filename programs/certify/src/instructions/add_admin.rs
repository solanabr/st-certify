//! add_admin (disc 1, 33 B): `config(w), …admins`. 2 distinct admin signers.
//! Data: [1..33]=new_admin.

use {
    super::{addr_at, require_admins},
    crate::{
        constants::{T_DESTRUCTIVE, ZERO_ADDRESS},
        state::config::ConfigMut,
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 33 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_DESTRUCTIVE)?;

    let new = addr_at(data, 1);
    if new == ZERO_ADDRESS {
        return Err(ProgramError::InvalidArgument);
    }
    let [config_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut cfg = ConfigMut::load_mut(config_acc, program_id)?;
    cfg.push_admin(&new).map_err(ProgramError::from)
}
