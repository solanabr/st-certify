//! Toolchain smoke tests — validate that LiteSVM and Mollusk load and execute
//! the compiled `.so`. These pass regardless of handler completeness (an unknown
//! discriminator is rejected by both the stub and the real processor).

use {
    certify_tests::*,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_signer::Signer,
    solana_transaction::Transaction,
};

#[test]
fn program_loads_into_litesvm() {
    let svm = setup();
    let acct = svm
        .get_account(&PROGRAM_ID)
        .expect("program account present");
    assert!(acct.executable, "program must be executable");
}

#[test]
fn pdas_are_deterministic() {
    let (config, _) = config_pda();
    assert_eq!(config, config_pda().0);
    let student = Keypair::new().pubkey();
    let (edition, _) = edition_pda(0);
    let (cert, _) = cert_pda(&edition, &student);
    assert_ne!(cert, edition);
}

#[test]
fn unknown_discriminator_is_rejected() {
    let mut svm = setup();
    let payer = funded_keypair(&mut svm, 1_000_000_000);
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![AccountMeta::new(payer.pubkey(), true)],
        data: vec![99u8], // no such instruction
    };
    let t = Transaction::new_signed_with_payer(
        &[ix],
        Some(&payer.pubkey()),
        &[&payer],
        svm.latest_blockhash(),
    );
    assert!(svm.send_transaction(t).is_err(), "unknown disc must fail");
}

#[test]
fn mollusk_loads_and_runs() {
    let m = mollusk();
    let ix = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![],
        data: vec![99u8],
    };
    let res = m.process_instruction(&ix, &[]);
    assert!(
        res.program_result.is_err(),
        "unknown disc must fail in Mollusk"
    );
    println!(
        "[smoke] mollusk unknown-disc CU: {}",
        res.compute_units_consumed
    );
}
