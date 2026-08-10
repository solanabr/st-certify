//! claim_certificate (disc 10, 33 B): `student(w,s), notary(s), config, edition(w),
//! cert(w), hash_index(w), system`. Data: [1..33]=artifact_hash.
//!
//! Student + notary (== config.notary) co-sign. FullySigned → Claimed. Creates
//! the HashIndex (squat-proof — only this path creates it; duplicate artifact
//! fails structurally at [C]). cert_number = edition.certs_claimed + 1.

use {
    super::arr32_at,
    crate::{
        constants::{cert_status, seeds},
        error::CertifyError,
        load,
        state::{
            certificate::{Certificate, CertificateMut},
            config::Config,
            edition::EditionMut,
            hash_index::{HashIndexMut, LEN as HASH_LEN},
        },
    },
    pinocchio::{
        account::AccountView,
        error::ProgramError,
        sysvars::{clock::Clock, Sysvar},
        Address, ProgramResult,
    },
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 33 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let [student, notary, config_acc, edition_acc, cert_acc, hash_acc, system, ..] = accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    load::check_signer(student)?;
    load::check_signer(notary)?;
    load::check_system_program(system)?;

    let artifact_hash = arr32_at(data, 1);
    if artifact_hash == [0u8; 32] {
        return Err(CertifyError::InvalidHash.into());
    }

    let student_key = *student.address();
    let edition_key = *edition_acc.address();

    // Notary must equal config.notary.
    {
        let config = Config::load(config_acc, program_id)?;
        if config.notary() != *notary.address() {
            return Err(CertifyError::InvalidNotary.into());
        }
    }
    // Certificate must belong to this student+edition and be FullySigned.
    {
        let cert = Certificate::load(cert_acc, program_id)?;
        if cert.student() != student_key {
            return Err(CertifyError::WrongStudent.into());
        }
        if cert.edition() != edition_key {
            return Err(CertifyError::WrongEdition.into());
        }
        if cert.status() != cert_status::FULLY_SIGNED {
            return Err(CertifyError::InvalidCertStatus.into());
        }
    }

    // Sequence number from the edition; increment claimed count.
    let cert_number = {
        let mut ed = EditionMut::load_mut(edition_acc, program_id)?;
        let n = ed
            .certs_claimed()
            .checked_add(1)
            .ok_or(CertifyError::Overflow)?;
        ed.set_certs_claimed(n);
        n
    };

    // Create the HashIndex (duplicate artifact_hash fails structurally here).
    let cert_key = *cert_acc.address();
    let bump = load::create_pda(
        hash_acc,
        student,
        &[seeds::HASH, &artifact_hash[..]],
        HASH_LEN,
        program_id,
    )?;
    {
        let mut hi = HashIndexMut::init(hash_acc, bump)?;
        hi.set_certificate(&cert_key);
    }

    // Finalize the certificate.
    let mut cert = CertificateMut::load_mut(cert_acc, program_id)?;
    cert.set_artifact_hash(&artifact_hash);
    cert.set_claimed_at(Clock::get()?.unix_timestamp);
    cert.set_cert_number(cert_number);
    cert.set_status(cert_status::CLAIMED);
    Ok(())
}
