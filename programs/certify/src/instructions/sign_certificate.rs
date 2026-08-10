//! sign_certificate (disc 8, 1 B): `signer(s), edition(ro), cert(w)`. Hot path.
//! Edition is READ-ONLY (no write contention in mass-signing). Already-signed →
//! `Ok(())` no-op (idempotent batch retries — NOT an error). Records the Clock
//! timestamp; flips to FullySigned when the mask completes.

use {
    crate::{
        constants::cert_status,
        error::CertifyError,
        load,
        state::{certificate::CertificateMut, edition::Edition},
    },
    pinocchio::{
        account::AccountView,
        error::ProgramError,
        sysvars::{clock::Clock, Sysvar},
        Address, ProgramResult,
    },
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let [signer, edition_acc, cert_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    load::check_signer(signer)?;

    let edition = Edition::load(edition_acc, program_id)?;
    let mut cert = CertificateMut::load_mut(cert_acc, program_id)?;

    // Linkage: bit indices are per-edition, so the cert MUST belong to this edition.
    if cert.edition() != *edition_acc.address() {
        return Err(CertifyError::WrongEdition.into());
    }
    let i = edition
        .signer_index(signer.address())
        .ok_or(CertifyError::NotASigner)?;

    // Idempotent no-op FIRST (also makes sign-on-Claimed/Revoked a vacuous no-op).
    if cert.is_signed(i) {
        return Ok(());
    }
    if cert.status() != cert_status::REQUESTED {
        return Err(CertifyError::InvalidCertStatus.into());
    }

    cert.set_signed_bit(i);
    cert.set_sig_timestamp(i as usize, Clock::get()?.unix_timestamp);
    if cert.mask_complete(edition.signer_count()) {
        cert.set_status(cert_status::FULLY_SIGNED);
    }
    Ok(())
}
