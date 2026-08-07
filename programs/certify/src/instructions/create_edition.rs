//! create_edition (disc 4, 634 B): `payer(w,s), config(w), edition(w), system,
//! …admins`. 1 admin. Data: [1..65]=name, [65..97]=spec_hash, [97..105]=max_supply,
//! [105]=signer_count, [106..634]=signers[6][88].
//!
//! §11: exact len; owner-checked config; 1-admin threshold; canonical bump at
//! init ([C]); system CPI target; checked id math; enum/status validity. Created
//! Paused; spec-immutable thereafter.

use {
    super::{addr_at, arr32_at, require_admins, u64_at},
    crate::{
        constants::{edition_status, seeds, MAX_SIGNERS, MIN_SIGNERS, T_CREATE, ZERO_ADDRESS},
        error::CertifyError,
        load,
        state::{
            config::ConfigMut,
            edition::{EditionMut, LEN as EDITION_LEN},
        },
    },
    pinocchio::{
        account::AccountView,
        error::ProgramError,
        sysvars::{clock::Clock, Sysvar},
        Address, ProgramResult,
    },
};

const DATA_LEN: usize = 634;
const SLOTS: usize = 106;

pub fn process(program_id: &Address, accounts: &mut [AccountView], data: &[u8]) -> ProgramResult {
    if data.len() != DATA_LEN {
        return Err(ProgramError::InvalidInstructionData);
    }
    // config is at index 1 for this instruction.
    require_admins(program_id, accounts, 1, T_CREATE)?;

    let [payer, config_acc, edition_acc, system, ..] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };
    load::check_signer(payer)?;
    load::check_system_program(system)?;

    let signer_count = data[105];
    if !(MIN_SIGNERS..=MAX_SIGNERS).contains(&signer_count) {
        return Err(CertifyError::InvalidSignerCount.into());
    }
    let spec_hash = arr32_at(data, 65);
    if spec_hash == [0u8; 32] {
        return Err(ProgramError::InvalidArgument);
    }

    // Signer slots: [..count] pubkeys nonzero + pairwise-distinct; tail all-zero.
    let sc = signer_count as usize;
    let mut seen = [ZERO_ADDRESS; MAX_SIGNERS as usize];
    for i in 0..sc {
        let pk = addr_at(data, SLOTS + i * 88);
        if pk == ZERO_ADDRESS {
            return Err(ProgramError::InvalidArgument);
        }
        if seen[..i].contains(&pk) {
            return Err(CertifyError::DuplicateSigner.into());
        }
        seen[i] = pk;
    }
    for i in sc..MAX_SIGNERS as usize {
        let base = SLOTS + i * 88;
        if data[base..base + 88].iter().any(|&b| b != 0) {
            return Err(ProgramError::InvalidArgument);
        }
    }

    // Assign the next edition id and create the edition PDA.
    let mut cfg = ConfigMut::load_mut(config_acc, program_id)?;
    let id = cfg.editions_created();
    cfg.set_editions_created(id.checked_add(1).ok_or(CertifyError::Overflow)?);

    let id_le = id.to_le_bytes();
    let bump = load::create_pda(
        edition_acc,
        payer,
        &[seeds::EDITION, &id_le],
        EDITION_LEN,
        program_id,
    )?;

    let mut ed = EditionMut::init(edition_acc, bump)?;
    ed.set_status(edition_status::PAUSED);
    ed.set_signer_count(signer_count);
    ed.set_id(id);
    ed.set_name_raw(&data[1..65]);
    ed.set_spec_hash(&spec_hash);
    ed.set_signers_raw(&data[SLOTS..DATA_LEN]);
    ed.set_max_supply(u64_at(data, 97));
    ed.set_created_at(Clock::get()?.unix_timestamp);
    Ok(())
}
