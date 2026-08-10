//! set_edition_status (disc 5, 2 B): `config, edition(w), …admins`. 1 admin.
//! Data: [1]=status ∈ {1 Paused, 2 Open, 3 Closed}. Free transitions among the three.

use {
    super::require_admins,
    crate::{
        constants::{edition_status, T_CREATE},
        error::CertifyError,
        state::edition::EditionMut,
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 2 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_CREATE)?;

    let status = data[1];
    if !matches!(
        status,
        edition_status::PAUSED | edition_status::OPEN | edition_status::CLOSED
    ) {
        return Err(CertifyError::InvalidStatusValue.into());
    }
    let [_config, edition_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut ed = EditionMut::load_mut(edition_acc, program_id)?;
    ed.set_status(status);
    Ok(())
}
