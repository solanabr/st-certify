//! Instruction dispatch: peek the u8 discriminator (data[0]) and route to the
//! handler, passing the FULL data slice (handlers assert their own exact length).

use {
    crate::instructions::*,
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    let disc = *data.first().ok_or(ProgramError::InvalidInstructionData)?;
    match disc {
        0 => init_config::process(program_id, accounts, data),
        1 => add_admin::process(program_id, accounts, data),
        2 => remove_admin::process(program_id, accounts, data),
        3 => set_notary::process(program_id, accounts, data),
        4 => create_edition::process(program_id, accounts, data),
        5 => set_edition_status::process(program_id, accounts, data),
        6 => set_max_supply::process(program_id, accounts, data),
        7 => request_certificate::process(program_id, accounts, data),
        8 => sign_certificate::process(program_id, accounts, data),
        9 => reject_request::process(program_id, accounts, data),
        10 => claim_certificate::process(program_id, accounts, data),
        11 => record_asset::process(program_id, accounts, data),
        12 => revoke_certificate::process(program_id, accounts, data),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}
