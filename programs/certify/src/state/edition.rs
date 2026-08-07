//! `Edition` — PDA `[b"edition", id_le]`, discriminator `0x02`, 676 B.
//! Spec-immutable from creation (no mutation ix for name/spec_hash/signers/id).
//!
//! | off | size | field                                   |
//! |-----|------|-----------------------------------------|
//! | 0   | 1    | disc = 2                                |
//! | 1   | 1    | bump                                    |
//! | 2   | 1    | status (1 Paused / 2 Open / 3 Closed)   |
//! | 3   | 1    | signer_count (2..=6)                    |
//! | 4   | 8    | id u64le                                |
//! | 12  | 64   | name[64]                                |
//! | 76  | 32   | spec_hash                               |
//! | 108 | 528  | signers[6]×88 (pubkey32,name32,role24)  |
//! | 636 | 8    | max_supply u64le                        |
//! | 644 | 8    | certs_requested u64le                   |
//! | 652 | 8    | certs_closed u64le                      |
//! | 660 | 8    | certs_claimed u64le                     |
//! | 668 | 8    | created_at i64le                        |

use {
    super::{read_array32, read_i64, read_u64, write_i64, write_u64, BUMP, DISC},
    crate::constants::{disc, seeds, MAX_SIGNERS},
    pinocchio::{
        account::{AccountView, Ref, RefMut},
        error::ProgramError,
        Address,
    },
};

pub const STATUS: usize = 2;
pub const SIGNER_COUNT: usize = 3;
pub const ID: usize = 4;
pub const NAME: usize = 12;
pub const NAME_LEN: usize = 64;
pub const SPEC_HASH: usize = 76;
pub const SIGNERS: usize = 108;
pub const SIGNER_SIZE: usize = 88;
pub const MAX_SUPPLY: usize = 636;
pub const CERTS_REQUESTED: usize = 644;
pub const CERTS_CLOSED: usize = 652;
pub const CERTS_CLAIMED: usize = 660;
pub const CREATED_AT: usize = 668;
pub const LEN: usize = 676;

/// Byte span of the six signer slots: `signers_raw()` / `set_signers_raw()`.
pub const SIGNERS_SPAN: usize = MAX_SIGNERS as usize * SIGNER_SIZE; // 528

const _: () = assert!(NAME + NAME_LEN == SPEC_HASH);
const _: () = assert!(SPEC_HASH + 32 == SIGNERS);
const _: () = assert!(SIGNERS + SIGNERS_SPAN == MAX_SUPPLY);
const _: () = assert!(CREATED_AT + 8 == LEN);

#[inline(always)]
fn signer_slot(i: usize) -> usize {
    SIGNERS + i * SIGNER_SIZE
}

pub struct Edition<'a>(Ref<'a, [u8]>);
pub struct EditionMut<'a>(RefMut<'a, [u8]>);

impl<'a> Edition<'a> {
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
    pub fn signer_count(&self) -> u8 {
        self.0[SIGNER_COUNT]
    }
    pub fn id(&self) -> u64 {
        read_u64(&self.0, ID)
    }
    pub fn spec_hash(&self) -> [u8; 32] {
        read_array32(&self.0, SPEC_HASH)
    }
    pub fn signer_pubkey(&self, i: usize) -> Address {
        Address::new_from_array(read_array32(&self.0, signer_slot(i)))
    }
    /// Linear scan of `signers[..signer_count]`; returns the bit index of `who`.
    pub fn signer_index(&self, who: &Address) -> Option<u8> {
        signer_index(&self.0, who)
    }
    pub fn max_supply(&self) -> u64 {
        read_u64(&self.0, MAX_SUPPLY)
    }
    pub fn certs_requested(&self) -> u64 {
        read_u64(&self.0, CERTS_REQUESTED)
    }
    pub fn certs_closed(&self) -> u64 {
        read_u64(&self.0, CERTS_CLOSED)
    }
    pub fn certs_claimed(&self) -> u64 {
        read_u64(&self.0, CERTS_CLAIMED)
    }
    pub fn created_at(&self) -> i64 {
        read_i64(&self.0, CREATED_AT)
    }
}

impl<'a> EditionMut<'a> {
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
        data[DISC] = disc::EDITION;
        data[BUMP] = bump;
        Ok(Self(data))
    }

    // --- getters ---
    pub fn status(&self) -> u8 {
        self.0[STATUS]
    }
    pub fn signer_count(&self) -> u8 {
        self.0[SIGNER_COUNT]
    }
    pub fn id(&self) -> u64 {
        read_u64(&self.0, ID)
    }
    pub fn signer_index(&self, who: &Address) -> Option<u8> {
        signer_index(&self.0, who)
    }
    pub fn max_supply(&self) -> u64 {
        read_u64(&self.0, MAX_SUPPLY)
    }
    pub fn certs_requested(&self) -> u64 {
        read_u64(&self.0, CERTS_REQUESTED)
    }
    pub fn certs_closed(&self) -> u64 {
        read_u64(&self.0, CERTS_CLOSED)
    }
    pub fn certs_claimed(&self) -> u64 {
        read_u64(&self.0, CERTS_CLAIMED)
    }

    // --- setters (creation writes name/spec_hash/signers/id/created_at once) ---
    pub fn set_status(&mut self, s: u8) {
        self.0[STATUS] = s;
    }
    pub fn set_signer_count(&mut self, n: u8) {
        self.0[SIGNER_COUNT] = n;
    }
    pub fn set_id(&mut self, id: u64) {
        write_u64(&mut self.0, ID, id);
    }
    pub fn set_name_raw(&mut self, name: &[u8]) {
        self.0[NAME..NAME + NAME_LEN].copy_from_slice(name);
    }
    pub fn set_spec_hash(&mut self, h: &[u8; 32]) {
        self.0[SPEC_HASH..SPEC_HASH + 32].copy_from_slice(h);
    }
    /// Bulk-copy the 528-byte signer block (already validated by the caller).
    pub fn set_signers_raw(&mut self, signers: &[u8]) {
        self.0[SIGNERS..SIGNERS + SIGNERS_SPAN].copy_from_slice(signers);
    }
    pub fn set_max_supply(&mut self, v: u64) {
        write_u64(&mut self.0, MAX_SUPPLY, v);
    }
    pub fn set_certs_requested(&mut self, v: u64) {
        write_u64(&mut self.0, CERTS_REQUESTED, v);
    }
    pub fn set_certs_closed(&mut self, v: u64) {
        write_u64(&mut self.0, CERTS_CLOSED, v);
    }
    pub fn set_certs_claimed(&mut self, v: u64) {
        write_u64(&mut self.0, CERTS_CLAIMED, v);
    }
    pub fn set_created_at(&mut self, ts: i64) {
        write_i64(&mut self.0, CREATED_AT, ts);
    }
}

fn gate(data: &[u8], addr: &Address, program_id: &Address) -> Result<(), ProgramError> {
    if data.len() != LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[DISC] != disc::EDITION {
        return Err(ProgramError::InvalidAccountData);
    }
    let bump = data[BUMP];
    let id_le = read_u64(data, ID).to_le_bytes();
    let expected = Address::create_program_address(&[seeds::EDITION, &id_le, &[bump]], program_id)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if &expected != addr {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

#[inline(always)]
fn signer_index(data: &[u8], who: &Address) -> Option<u8> {
    let count = data[SIGNER_COUNT] as usize;
    let w = who.as_array();
    for i in 0..count {
        let s = signer_slot(i);
        if data[s..s + 32] == w[..] {
            return Some(i as u8);
        }
    }
    None
}
