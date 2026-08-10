//! `Certificate` — PDA `[b"cert", edition, student]`, discriminator `0x03`, 228 B.
//!
//! | off | size | field                          |
//! |-----|------|--------------------------------|
//! | 0   | 1    | disc = 3                       |
//! | 1   | 1    | bump                           |
//! | 2   | 1    | status (1 Req/2 Full/3 Claim/4 Rev) |
//! | 3   | 1    | signed_mask                    |
//! | 4   | 32   | edition                        |
//! | 36  | 32   | student                        |
//! | 68  | 32   | name_commitment                |
//! | 100 | 32   | artifact_hash                  |
//! | 132 | 32   | asset                          |
//! | 164 | 8    | cert_number u64le              |
//! | 172 | 48   | sig_timestamps[6] i64le        |
//! | 220 | 8    | claimed_at i64le               |

use {
    super::{read_array32, read_i64, read_u64, write_array32, write_i64, write_u64, BUMP, DISC},
    crate::constants::{disc, seeds, MAX_SIGNERS},
    pinocchio::{
        account::{AccountView, Ref, RefMut},
        error::ProgramError,
        Address,
    },
};

pub const STATUS: usize = 2;
pub const SIGNED_MASK: usize = 3;
pub const EDITION: usize = 4;
pub const STUDENT: usize = 36;
pub const NAME_COMMITMENT: usize = 68;
pub const ARTIFACT_HASH: usize = 100;
pub const ASSET: usize = 132;
pub const CERT_NUMBER: usize = 164;
pub const SIG_TIMESTAMPS: usize = 172;
pub const CLAIMED_AT: usize = 220;
pub const LEN: usize = 228;

const _: () = assert!(SIG_TIMESTAMPS + (MAX_SIGNERS as usize) * 8 == CLAIMED_AT);
const _: () = assert!(CLAIMED_AT + 8 == LEN);

#[inline(always)]
fn sig_ts_slot(i: usize) -> usize {
    SIG_TIMESTAMPS + i * 8
}

pub struct Certificate<'a>(Ref<'a, [u8]>);
pub struct CertificateMut<'a>(RefMut<'a, [u8]>);

impl<'a> Certificate<'a> {
    pub fn load(acc: &'a AccountView, program_id: &Address) -> Result<Self, ProgramError> {
        if !acc.owned_by(program_id) {
            return Err(ProgramError::IncorrectProgramId);
        }
        let addr = *acc.address();
        let data = acc.try_borrow()?;
        gate(&data, &addr, program_id)?;
        Ok(Self(data))
    }

    pub fn status(&self) -> u8 {
        self.0[STATUS]
    }
    pub fn signed_mask(&self) -> u8 {
        self.0[SIGNED_MASK]
    }
    pub fn edition(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, EDITION))
    }
    pub fn student(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, STUDENT))
    }
    pub fn artifact_hash(&self) -> [u8; 32] {
        read_array32(&self.0, ARTIFACT_HASH)
    }
    pub fn asset(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, ASSET))
    }
    pub fn cert_number(&self) -> u64 {
        read_u64(&self.0, CERT_NUMBER)
    }
    pub fn sig_timestamp(&self, i: usize) -> i64 {
        read_i64(&self.0, sig_ts_slot(i))
    }
    pub fn claimed_at(&self) -> i64 {
        read_i64(&self.0, CLAIMED_AT)
    }
}

impl<'a> CertificateMut<'a> {
    pub fn load_mut(acc: &'a mut AccountView, program_id: &Address) -> Result<Self, ProgramError> {
        if !acc.owned_by(program_id) {
            return Err(ProgramError::IncorrectProgramId);
        }
        let addr = *acc.address();
        let data = acc.try_borrow_mut()?;
        gate(&data, &addr, program_id)?;
        Ok(Self(data))
    }

    pub fn init(acc: &'a mut AccountView, bump: u8) -> Result<Self, ProgramError> {
        let mut data = acc.try_borrow_mut()?;
        if data.len() != LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        data[DISC] = disc::CERTIFICATE;
        data[BUMP] = bump;
        Ok(Self(data))
    }

    // --- getters ---
    pub fn status(&self) -> u8 {
        self.0[STATUS]
    }
    pub fn signed_mask(&self) -> u8 {
        self.0[SIGNED_MASK]
    }
    pub fn edition(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, EDITION))
    }
    pub fn student(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, STUDENT))
    }
    pub fn artifact_hash(&self) -> [u8; 32] {
        read_array32(&self.0, ARTIFACT_HASH)
    }
    pub fn asset(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, ASSET))
    }
    pub fn cert_number(&self) -> u64 {
        read_u64(&self.0, CERT_NUMBER)
    }
    pub fn claimed_at(&self) -> i64 {
        read_i64(&self.0, CLAIMED_AT)
    }
    /// True if signer bit `i` is already set.
    pub fn is_signed(&self, i: u8) -> bool {
        self.0[SIGNED_MASK] & (1u8 << i) != 0
    }
    /// True if all `count` signer bits are set.
    pub fn mask_complete(&self, count: u8) -> bool {
        let full = (1u16 << count) - 1;
        self.0[SIGNED_MASK] as u16 == full
    }

    // --- setters ---
    pub fn set_status(&mut self, s: u8) {
        self.0[STATUS] = s;
    }
    pub fn set_edition(&mut self, edition: &Address) {
        write_array32(&mut self.0, EDITION, edition.as_array());
    }
    pub fn set_student(&mut self, student: &Address) {
        write_array32(&mut self.0, STUDENT, student.as_array());
    }
    pub fn set_name_commitment(&mut self, c: &[u8; 32]) {
        write_array32(&mut self.0, NAME_COMMITMENT, c);
    }
    pub fn set_artifact_hash(&mut self, h: &[u8; 32]) {
        write_array32(&mut self.0, ARTIFACT_HASH, h);
    }
    pub fn set_asset(&mut self, asset: &Address) {
        write_array32(&mut self.0, ASSET, asset.as_array());
    }
    pub fn set_cert_number(&mut self, n: u64) {
        write_u64(&mut self.0, CERT_NUMBER, n);
    }
    /// Set signer bit `i` in the signed mask (idempotent).
    pub fn set_signed_bit(&mut self, i: u8) {
        self.0[SIGNED_MASK] |= 1u8 << i;
    }
    pub fn set_sig_timestamp(&mut self, i: usize, ts: i64) {
        write_i64(&mut self.0, sig_ts_slot(i), ts);
    }
    pub fn set_claimed_at(&mut self, ts: i64) {
        write_i64(&mut self.0, CLAIMED_AT, ts);
    }
}

fn gate(data: &[u8], addr: &Address, program_id: &Address) -> Result<(), ProgramError> {
    if data.len() != LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[DISC] != disc::CERTIFICATE {
        return Err(ProgramError::InvalidAccountData);
    }
    let bump = data[BUMP];
    let expected = Address::create_program_address(
        &[
            seeds::CERT,
            &data[EDITION..EDITION + 32],
            &data[STUDENT..STUDENT + 32],
            &[bump],
        ],
        program_id,
    )
    .map_err(|_| ProgramError::InvalidSeeds)?;
    if &expected != addr {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}
