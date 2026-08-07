//! Instruction dispatch (u8 discriminator). STUB — owned by task #11.
//! Replace the body with the real `match data.split_first()` dispatch.

use pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult};

pub fn process(
    _program_id: &Address,
    _accounts: &mut [AccountView],
    _data: &[u8],
) -> ProgramResult {
    Err(ProgramError::InvalidInstructionData)
}
