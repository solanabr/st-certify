//! revoke_certificate (disc 12, 1 B): `config, cert(w), …admins`. 2 distinct
//! admin signers. Claimed → Revoked (permanent). HashIndex + counters untouched;
//! the supply slot stays consumed.

use {
    super::require_admins,
    crate::{
        constants::{cert_status, T_DESTRUCTIVE},
        error::CertifyError,
        state::certificate::CertificateMut,
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 1 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_DESTRUCTIVE)?;

    let [_config, cert_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut cert = CertificateMut::load_mut(cert_acc, program_id)?;
    if cert.status() != cert_status::CLAIMED {
        return Err(CertifyError::InvalidCertStatus.into());
    }
    cert.set_status(cert_status::REVOKED);
    Ok(())
}
