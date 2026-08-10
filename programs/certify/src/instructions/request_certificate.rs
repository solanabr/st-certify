//! request_certificate (disc 7, 33 B): `student(w,s), edition(w), cert(w), system`.
//! Data: [1..33]=name_commitment. Student-authorized. Duplicate request fails
//! structurally ([C] virgin check — one cert per (edition, student)).

use {
    super::arr32_at,
    crate::{
        constants::{cert_status, edition_status, seeds},
        error::CertifyError,
        load,
        state::{
            certificate::{CertificateMut, LEN as CERT_LEN},
            edition::EditionMut,
        },
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 33 {
        return Err(ProgramError::InvalidInstructionData);
    }
    let [student, edition_acc, cert_acc, system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    load::check_signer(student)?;
    load::check_system_program(system)?;

    let commitment = arr32_at(data, 1);
    if commitment == [0u8; 32] {
        return Err(CertifyError::InvalidCommitment.into());
    }

    // Capture keys before taking mutable borrows (address() needs &self).
    let edition_key = *edition_acc.address();
    let student_key = *student.address();

    // Edition must be Open; enforce supply; bump certs_requested.
    {
        let mut ed = EditionMut::load_mut(edition_acc, program_id)?;
        if ed.status() != edition_status::OPEN {
            return Err(CertifyError::EditionNotOpen.into());
        }
        let max = ed.max_supply();
        if max != 0 {
            let live = ed
                .certs_requested()
                .checked_sub(ed.certs_closed())
                .ok_or(CertifyError::Overflow)?;
            if live >= max {
                return Err(CertifyError::SupplyExhausted.into());
            }
        }
        ed.set_certs_requested(
            ed.certs_requested()
                .checked_add(1)
                .ok_or(CertifyError::Overflow)?,
        );
    }

    // Create the certificate PDA and initialize it.
    let seeds_cert: [&[u8]; 3] = [
        seeds::CERT,
        &edition_key.as_array()[..],
        &student_key.as_array()[..],
    ];
    let bump = load::create_pda(cert_acc, student, &seeds_cert, CERT_LEN, program_id)?;

    let mut cert = CertificateMut::init(cert_acc, bump)?;
    cert.set_status(cert_status::REQUESTED);
    cert.set_edition(&edition_key);
    cert.set_student(&student_key);
    cert.set_name_commitment(&commitment);
    Ok(())
}
