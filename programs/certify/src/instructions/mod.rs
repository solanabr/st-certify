//! Instruction handlers (13). Each `process` receives the FULL instruction data
//! (discriminator at [0], payload from [1]), asserts its exact §3 length, runs
//! the never-omit validation checklist (§11), then mutates. Authz is account-
//! based (signer flags + admin registry), never trusted from instruction data.

use {
    crate::{error::CertifyError, state::config::Config, threshold::count_unique_admin_signers},
    pinocchio::{account::AccountView, error::ProgramError, Address},
};

pub mod add_admin;
pub mod claim_certificate;
pub mod create_edition;
pub mod init_config;
pub mod record_asset;
pub mod reject_request;
pub mod remove_admin;
pub mod request_certificate;
pub mod revoke_certificate;
pub mod set_edition_status;
pub mod set_max_supply;
pub mod set_notary;
pub mod sign_certificate;

/// Phase-1 admin authorization: load Config at `config_idx` (owner/len/disc/PDA)
/// and require at least `threshold` pairwise-distinct admin signers across the
/// full account slice. Immutable — returns before any mutable borrow is taken.
pub(crate) fn require_admins(
    program_id: &Address,
    accounts: &[AccountView],
    config_idx: usize,
    threshold: u8,
) -> Result<(), ProgramError> {
    let config_acc = accounts
        .get(config_idx)
        .ok_or(ProgramError::NotEnoughAccountKeys)?;
    let cfg = Config::load(config_acc, program_id)?;
    if count_unique_admin_signers(&cfg, accounts) < threshold {
        return Err(CertifyError::NotAnAdmin.into());
    }
    Ok(())
}

/// Read a 32-byte `Address` from instruction data at `off` (bounds guaranteed by
/// the caller's exact-length check).
#[inline(always)]
pub(crate) fn addr_at(data: &[u8], off: usize) -> Address {
    let mut a = [0u8; 32];
    a.copy_from_slice(&data[off..off + 32]);
    Address::new_from_array(a)
}

/// Read a 32-byte array from instruction data at `off`.
#[inline(always)]
pub(crate) fn arr32_at(data: &[u8], off: usize) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(&data[off..off + 32]);
    a
}

/// Read a little-endian `u64` from instruction data at `off`.
#[inline(always)]
pub(crate) fn u64_at(data: &[u8], off: usize) -> u64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(&data[off..off + 8]);
    u64::from_le_bytes(a)
}
