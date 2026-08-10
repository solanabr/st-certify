//! Account state layouts. Every account is a flat byte buffer with a 1-byte
//! discriminator at offset 0 and its canonical bump at offset 1. All multi-byte
//! scalars are little-endian byte arrays accessed through explicit-offset
//! helpers — ZERO `unsafe`, no pointer casts, no alignment assumptions.
//!
//! Views wrap the account's borrowed data slice (`Ref`/`RefMut`) and are
//! constructed only through the [L]+[P] load gates in [`crate::load`] (or, for
//! freshly-created accounts, the `init` constructors here). In-bounds access is
//! guaranteed by the exact-length check in every constructor plus the
//! compile-time offset asserts in each submodule.

pub mod certificate;
pub mod config;
pub mod edition;
pub mod hash_index;

/// Common offsets shared by all four account types.
pub const DISC: usize = 0;
pub const BUMP: usize = 1;

/// Read a little-endian `u64` at `off`. In-bounds by the constructor's exact
/// length check; the raw index is confined to this layout module by policy.
#[inline(always)]
pub(crate) fn read_u64(d: &[u8], off: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[off..off + 8]);
    u64::from_le_bytes(b)
}

/// Read a little-endian `i64` at `off`.
#[inline(always)]
pub(crate) fn read_i64(d: &[u8], off: usize) -> i64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&d[off..off + 8]);
    i64::from_le_bytes(b)
}

/// Write a little-endian `u64` at `off`.
#[inline(always)]
pub(crate) fn write_u64(d: &mut [u8], off: usize, v: u64) {
    d[off..off + 8].copy_from_slice(&v.to_le_bytes());
}

/// Write a little-endian `i64` at `off`.
#[inline(always)]
pub(crate) fn write_i64(d: &mut [u8], off: usize, v: i64) {
    d[off..off + 8].copy_from_slice(&v.to_le_bytes());
}

/// Copy the 32 bytes at `off` into a fresh `[u8; 32]`.
#[inline(always)]
pub(crate) fn read_array32(d: &[u8], off: usize) -> [u8; 32] {
    let mut b = [0u8; 32];
    b.copy_from_slice(&d[off..off + 32]);
    b
}

/// Write 32 bytes at `off`.
#[inline(always)]
pub(crate) fn write_array32(d: &mut [u8], off: usize, v: &[u8; 32]) {
    d[off..off + 32].copy_from_slice(v);
}
