//! set_notary (disc 3, 33 B): `config(w), …admins`. 2 distinct admin signers.
//! Data: [1..33]=new_notary.

use {
    super::{addr_at, require_admins},
    crate::{
        constants::{T_DESTRUCTIVE, ZERO_ADDRESS},
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

    let notary = addr_at(data, 1);
    if notary == ZERO_ADDRESS {
        return Err(CertifyError::InvalidNotary.into());
    }
    let [config_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut cfg = ConfigMut::load_mut(config_acc, program_id)?;
    cfg.set_notary(&notary);
    Ok(())
}
