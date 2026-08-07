//! set_max_supply (disc 6, 9 B): `config, edition(w), …admins`. 1 admin.
//! Data: [1..9]=max_supply u64 (0 = uncapped). A nonzero cap must not fall below
//! the live outstanding count (`certs_requested - certs_closed`).

use {
    super::{require_admins, u64_at},
    crate::{constants::T_CREATE, error::CertifyError, state::edition::EditionMut},
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 9 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_CREATE)?;

    let new_max = u64_at(data, 1);
    let [_config, edition_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut ed = EditionMut::load_mut(edition_acc, program_id)?;
    if new_max != 0 {
        let live = ed
            .certs_requested()
            .checked_sub(ed.certs_closed())
            .ok_or(CertifyError::Overflow)?;
        if new_max < live {
            return Err(CertifyError::SupplyExhausted.into());
        }
    }
    ed.set_max_supply(new_max);
    Ok(())
}
