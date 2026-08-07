//! Custom program errors, surfaced as `ProgramError::Custom(code)`.
//!
//! Codes are stable ABI: the TS client maps them back to human messages, so the
//! numeric values MUST NOT change. `EditionLocked` and `StringTooLong` from the
//! Anchor baseline are eliminated structurally and intentionally absent.

use pinocchio::error::ProgramError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum CertifyError {
    NotAnAdmin = 0,
    NotASigner = 1,
    InvalidNotary = 2,
    InvalidCertStatus = 3,
    EditionNotOpen = 4,
    SupplyExhausted = 5,
    DuplicateSigner = 6,
    InvalidSignerCount = 7,
    InvalidCommitment = 8,
    AdminListFull = 9,
    AdminAlreadyExists = 10,
    AdminNotFound = 11,
    BelowMinAdmins = 12,
    AssetAlreadyRecorded = 13,
    InvalidHash = 14,
    Overflow = 15,
    WrongEdition = 16,
    InvalidStatusValue = 17,
    AccountAlreadyInitialized = 18,
    WrongStudent = 19,
}

impl From<CertifyError> for ProgramError {
    #[inline(always)]
    fn from(e: CertifyError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
