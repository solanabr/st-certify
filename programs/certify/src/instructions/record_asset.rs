//! record_asset (disc 11, 33 B): `config, cert(w), …admins`. 1 admin (OPERATOR).
//! Data: [1..33]=asset. Set-once: writes the minted Core asset into the cert.

use {
    super::{addr_at, require_admins},
    crate::{
        constants::{cert_status, T_CREATE, ZERO_ADDRESS},
        error::CertifyError,
        state::certificate::CertificateMut,
    },
    pinocchio::{account::AccountView, error::ProgramError, Address, ProgramResult},
};

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != 33 {
        return Err(ProgramError::InvalidInstructionData);
    }
    require_admins(program_id, accounts, 0, T_CREATE)?;

    let asset = addr_at(data, 1);
    if asset == ZERO_ADDRESS {
        return Err(ProgramError::InvalidArgument);
    }
    let [_config, cert_acc, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    let mut cert = CertificateMut::load_mut(cert_acc, program_id)?;
    if cert.status() != cert_status::CLAIMED {
        return Err(CertifyError::InvalidCertStatus.into());
    }
    if cert.asset() != ZERO_ADDRESS {
        return Err(CertifyError::AssetAlreadyRecorded.into());
    }
    cert.set_asset(&asset);
    Ok(())
}
