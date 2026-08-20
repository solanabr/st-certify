//! `Config` — global singleton. PDA `[b"config"]`, discriminator `0x01`, 299 B.
//!
//! | off | size | field           |
//! |-----|------|-----------------|
//! | 0   | 1    | disc = 1        |
//! | 1   | 1    | bump            |
//! | 2   | 1    | admin_count     |
//! | 3   | 32   | notary          |
//! | 35  | 256  | admins[8][32]   |
//! | 291 | 8    | editions_created|

use {
    super::{read_array32, read_u64, write_array32, write_u64, BUMP, DISC},
    crate::{
        constants::{disc, seeds, BOOTSTRAP_ADMIN, MAX_ADMINS},
        error::CertifyError,
    },
    pinocchio::{
        account::{AccountView, Ref, RefMut},
        error::ProgramError,
        Address,
    },
};

pub const ADMIN_COUNT: usize = 2;
pub const NOTARY: usize = 3;
pub const ADMINS: usize = 35;
pub const EDITIONS_CREATED: usize = 291;
pub const LEN: usize = 299;

// Compile-time layout proof: a wrong offset is a build error, not silent corruption.
const _: () = assert!(NOTARY + 32 == ADMINS);
const _: () = assert!(ADMINS + (MAX_ADMINS as usize) * 32 == EDITIONS_CREATED);
const _: () = assert!(EDITIONS_CREATED + 8 == LEN);

#[inline(always)]
fn admin_slot(i: usize) -> usize {
    ADMINS + i * 32
}

/// Read-only `Config` view over borrowed account data. Constructed via [`Config::load`].
pub struct Config<'a>(Ref<'a, [u8]>);

/// Mutable `Config` view. Constructed via [`ConfigMut::load_mut`] or [`ConfigMut::init`].
pub struct ConfigMut<'a>(RefMut<'a, [u8]>);

impl<'a> Config<'a> {
    /// [L]+[P] read gate: owner == program, exact length, discriminator, and
    /// canonical-bump PDA rederivation.
    pub fn load(acc: &'a AccountView, program_id: &Address) -> Result<Self, ProgramError> {
        if !acc.owned_by(program_id) {
            return Err(ProgramError::IncorrectProgramId);
        }
        let addr = *acc.address();
        let data = acc.try_borrow()?;
        gate(&data, &addr, program_id)?;
        Ok(Self(data))
    }

    pub fn admin_count(&self) -> u8 {
        self.0[ADMIN_COUNT]
    }
    pub fn notary(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, NOTARY))
    }
    pub fn admin_at(&self, i: usize) -> Address {
        Address::new_from_array(read_array32(&self.0, admin_slot(i)))
    }
    pub fn is_admin(&self, candidate: &Address) -> bool {
        is_admin(&self.0, candidate)
    }
    pub fn editions_created(&self) -> u64 {
        read_u64(&self.0, EDITIONS_CREATED)
    }
}

impl<'a> ConfigMut<'a> {
    /// [L]+[P] read/write gate — see [`Config::load`].
    pub fn load_mut(acc: &'a mut AccountView, program_id: &Address) -> Result<Self, ProgramError> {
        if !acc.owned_by(program_id) {
            return Err(ProgramError::IncorrectProgramId);
        }
        let addr = *acc.address();
        let data = acc.try_borrow_mut()?;
        gate(&data, &addr, program_id)?;
        Ok(Self(data))
    }

    /// Post-[C] initializer: exact length, stamp disc + bump. Does not gate the
    /// (still-zero) discriminator — the account was just created at its PDA.
    pub fn init(acc: &'a mut AccountView, bump: u8) -> Result<Self, ProgramError> {
        let mut data = acc.try_borrow_mut()?;
        if data.len() != LEN {
            return Err(ProgramError::InvalidAccountData);
        }
        data[DISC] = disc::CONFIG;
        data[BUMP] = bump;
        Ok(Self(data))
    }

    // --- getters ---
    pub fn admin_count(&self) -> u8 {
        self.0[ADMIN_COUNT]
    }
    pub fn notary(&self) -> Address {
        Address::new_from_array(read_array32(&self.0, NOTARY))
    }
    pub fn admin_at(&self, i: usize) -> Address {
        Address::new_from_array(read_array32(&self.0, admin_slot(i)))
    }
    pub fn is_admin(&self, candidate: &Address) -> bool {
        is_admin(&self.0, candidate)
    }
    pub fn editions_created(&self) -> u64 {
        read_u64(&self.0, EDITIONS_CREATED)
    }

    // --- setters / ops ---
    pub fn set_admin_count(&mut self, n: u8) {
        self.0[ADMIN_COUNT] = n;
    }
    pub fn set_notary(&mut self, notary: &Address) {
        write_array32(&mut self.0, NOTARY, notary.as_array());
    }
    pub fn set_admin_at(&mut self, i: usize, addr: &Address) {
        write_array32(&mut self.0, admin_slot(i), addr.as_array());
    }
    pub fn set_editions_created(&mut self, v: u64) {
        write_u64(&mut self.0, EDITIONS_CREATED, v);
    }

    /// Append an admin (structural checks only: not already present, room left).
    /// Threshold/nonzero policy is enforced by the caller.
    pub fn push_admin(&mut self, new: &Address) -> Result<(), CertifyError> {
        if is_admin(&self.0, new) {
            return Err(CertifyError::AdminAlreadyExists);
        }
        let count = self.0[ADMIN_COUNT] as usize;
        if count >= MAX_ADMINS as usize {
            return Err(CertifyError::AdminListFull);
        }
        write_array32(&mut self.0, admin_slot(count), new.as_array());
        self.0[ADMIN_COUNT] = (count + 1) as u8;
        Ok(())
    }

    /// Swap-remove an admin: move the last admin into the freed slot, zero the
    /// vacated tail slot, decrement count. Min-admins policy is enforced by the
    /// caller (needs the accounts slice, not just config data).
    ///
    /// The bootstrap recovery key is permanent and can never be removed — this is
    /// the chokepoint every removal path funnels through, so the guard lives here
    /// rather than in the (single) caller. Otherwise a `T_DESTRUCTIVE`-sized set
    /// of admins could evict it while the floor check still passed, defeating the
    /// recovery guarantee.
    pub fn swap_remove_admin(&mut self, target: &Address) -> Result<(), CertifyError> {
        if target == &BOOTSTRAP_ADMIN {
            return Err(CertifyError::CannotRemoveBootstrap);
        }
        let count = self.0[ADMIN_COUNT] as usize;
        let mut found = None;
        let target_bytes = target.as_array();
        for i in 0..count {
            if self.0[admin_slot(i)..admin_slot(i) + 32] == target_bytes[..] {
                found = Some(i);
                break;
            }
        }
        let idx = found.ok_or(CertifyError::AdminNotFound)?;
        // `found` is Some ⇒ the loop ran ⇒ count >= 1, so `count - 1` cannot underflow.
        let last = count - 1;
        if idx != last {
            let moved = read_array32(&self.0, admin_slot(last));
            write_array32(&mut self.0, admin_slot(idx), &moved);
        }
        write_array32(&mut self.0, admin_slot(last), &[0u8; 32]);
        self.0[ADMIN_COUNT] = last as u8;
        Ok(())
    }
}

/// [L]+[P] core (length, discriminator, canonical-bump rederivation).
fn gate(data: &[u8], addr: &Address, program_id: &Address) -> Result<(), ProgramError> {
    if data.len() != LEN {
        return Err(ProgramError::InvalidAccountData);
    }
    if data[DISC] != disc::CONFIG {
        return Err(ProgramError::InvalidAccountData);
    }
    let bump = data[BUMP];
    let expected = Address::create_program_address(&[seeds::CONFIG, &[bump]], program_id)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if &expected != addr {
        return Err(ProgramError::InvalidSeeds);
    }
    Ok(())
}

#[inline(always)]
fn is_admin(data: &[u8], candidate: &Address) -> bool {
    let count = data[ADMIN_COUNT] as usize;
    let cand = candidate.as_array();
    for i in 0..count {
        if data[admin_slot(i)..admin_slot(i) + 32] == cand[..] {
            return true;
        }
    }
    false
}
