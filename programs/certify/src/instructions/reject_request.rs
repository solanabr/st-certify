//! reject_request (disc 9, 1 B): `config, edition(w), cert(w), student_refund(w),
//! …authority`. Merged reject+close. Authz = ≥1 edition signer OR ≥1 admin among
//! the tx signers. Refund is address-targeted to `cert.student` (NO student sig).
//! Pre-claim only ({Requested, FullySigned}). Frees a supply slot.
//!
//! §12 close ordering: tombstone → drain → resize(1) → close (via [`load::close_to`]).

use {
    crate::{
        constants::cert_status,
        error::CertifyError,
        load,
        state::{
            certificate::Certificate,
            config::Config,
            edition::{Edition, EditionMut},
        },
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 1 {
        return Err(ProgramError::InvalidInstructionData);
    }

    // ── Phase 1: validation + authz (immutable full-slice access) ──
    {
        let config_acc = accounts.first().ok_or(ProgramError::NotEnoughAccountKeys)?;
        let edition_acc = accounts.get(1).ok_or(ProgramError::NotEnoughAccountKeys)?;
        let cert_acc = accounts.get(2).ok_or(ProgramError::NotEnoughAccountKeys)?;
        let refund_acc = accounts.get(3).ok_or(ProgramError::NotEnoughAccountKeys)?;

        let cert = Certificate::load(cert_acc, program_id)?;
        if cert.edition() != *edition_acc.address() {
            return Err(CertifyError::WrongEdition.into());
        }
        // Address-targeted refund: no student signature required.
        if *refund_acc.address() != cert.student() {
            return Err(CertifyError::WrongStudent.into());
        }
        let status = cert.status();
        if status != cert_status::REQUESTED && status != cert_status::FULLY_SIGNED {
            return Err(CertifyError::InvalidCertStatus.into());
        }

        // ≥1 edition signer OR ≥1 admin among the instruction's signers.
        let edition = Edition::load(edition_acc, program_id)?;
        let config = Config::load(config_acc, program_id)?;
        let authorized = accounts.iter().any(|a| {
            a.is_signer()
                && (edition.signer_index(a.address()).is_some() || config.is_admin(a.address()))
        });
        if !authorized {
            return Err(CertifyError::NotASigner.into());
        }
    }

    // ── Phase 2: free a supply slot, then close the cert to the student ──
    let [_config, edition_acc, cert_acc, refund_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    {
        let mut ed = EditionMut::load_mut(edition_acc, program_id)?;
        ed.set_certs_closed(
            ed.certs_closed()
                .checked_add(1)
                .ok_or(CertifyError::Overflow)?,
        );
    }
    load::close_to(cert_acc, refund_acc)
}
