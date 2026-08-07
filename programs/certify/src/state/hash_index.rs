//! `HashIndex` — PDA `[b"hash", artifact_hash]`, discriminator `0x04`, 34 B.
//! Written once inside notary-cosigned `claim_certificate`; never program-read
//! again and never closed (survives revoke). Reverse lookup: artifact_hash → cert.
//!
//! | off | size | field       |
//! |-----|------|-------------|
//! | 0   | 1    | disc = 4    |
//! | 1   | 1    | bump        |
//! | 2   | 32   | certificate |

use {
    super::{write_array32, BUMP, DISC},
    crate::constants::disc,
    pinocchio::{account::AccountView, error::ProgramError, Address},
};

pub const CERTIFICATE: usize = 2;
pub const LEN: usize = 34;

const _: () = assert!(CERTIFICATE + 32 == LEN);

pub struct HashIndexMut<'a>(pinocchio::account::RefMut<'a, [u8]>);

impl<'a> HashIndexMut<'a> {
    /// Post-[C] initializer: exact length, stamp disc + bump.
    pub fn init(acc: &'a mut AccountView, bump: u8) -> Result<Self, ProgramError> {
        let mut data = acc.try_borrow_mut()?;
        if data.len() != LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        data[DISC] = disc::HASH_INDEX;
        data[BUMP] = bump;
        Ok(Self(data))
    }

    pub fn set_certificate(&mut self, cert: &Address) {
        write_array32(&mut self.0, CERTIFICATE, cert.as_array());
    }
}
