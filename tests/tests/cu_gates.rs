//! Mollusk per-instruction CU regression gates. Pre-state is built in LiteSVM,
//! the relevant accounts are handed to Mollusk, and the isolated instruction's
//! `compute_units_consumed` is asserted against the appendix §7 ceiling. Actuals
//! are printed (run with `--nocapture`) and snapshotted in the report.

use {certify_tests::*, solana_keypair::Keypair, solana_signer::Signer};

fn ok_cu(
    m: &mollusk_svm::Mollusk,
    ix: &solana_instruction::Instruction,
    accts: &[(solana_pubkey::Pubkey, solana_account::Account)],
    label: &str,
    ceiling: u64,
) -> u64 {
    let res = m.process_instruction(ix, accts);
    assert!(
        res.program_result.is_ok(),
        "{label} failed: {:?}",
        res.program_result
    );
    let cu = res.compute_units_consumed;
    println!("[CU] {label:<16} = {cu:>6}  (ceiling {ceiling})");
    assert!(cu <= ceiling, "{label} CU {cu} exceeded ceiling {ceiling}");
    cu
}

#[test]
fn cu_init_config() {
    let m = mollusk();
    let payer = Keypair::new();
    let notary = Keypair::new();
    let admin = Keypair::new();
    let ix = ix_init_config(&payer.pubkey(), &notary.pubkey(), &[admin.pubkey()]);
    let accts = vec![
        (payer.pubkey(), sol_account(1_000_000_000)),
        (config_pda().0, sol_account(0)),
        sys_program(),
        // Genesis signer (is_signer set by the ix meta; Mollusk needs no secret).
        (constants::BOOTSTRAP_ADMIN, sol_account(1_000_000_000)),
    ];
    ok_cu(&m, &ix, &accts, "init_config", cu::INIT_CONFIG);
}

#[test]
fn cu_create_edition() {
    let env = boot();
    let m = mollusk();
    let id = decode_config(&account_data(&env.svm, &config_pda().0)).editions_created;
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let ix = ix_create_edition(
        &env.payer.pubkey(),
        id,
        "E",
        &[7u8; 32],
        0,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        &[env.admin1.pubkey()],
    );
    let accts = vec![
        (env.payer.pubkey(), sol_account(1_000_000_000)),
        live(&env.svm, &config_pda().0),
        (edition_pda(id).0, sol_account(0)),
        sys_program(),
        (env.admin1.pubkey(), sol_account(1_000_000_000)),
    ];
    ok_cu(&m, &ix, &accts, "create_edition", cu::CREATE_EDITION);
}

#[test]
fn cu_request_and_sign() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    let m = mollusk();

    // request: cert PDA created fresh.
    let (edition_key, _) = edition_pda(id);
    let (cert_key, _) = cert_pda(&edition_key, &student.pubkey());
    let req = ix_request(&student.pubkey(), id, &[9u8; 32]);
    let req_accts = vec![
        (student.pubkey(), sol_account(1_000_000_000)),
        live(&env.svm, &edition_key),
        (cert_key, sol_account(0)),
        sys_program(),
    ];
    ok_cu(&m, &req, &req_accts, "request", cu::REQUEST);

    // sign (hot path): drive the request in LiteSVM first, then measure.
    send(&mut env.svm, &student, &[&student], &[req]).expect("request");
    let sign = ix_sign(&s1.pubkey(), id, &student.pubkey());
    let sign_accts = vec![
        (s1.pubkey(), sol_account(1_000_000_000)),
        live(&env.svm, &edition_key),
        live(&env.svm, &cert_key),
    ];
    ok_cu(&m, &sign, &sign_accts, "sign", cu::SIGN);
}

#[test]
fn cu_claim_and_reject() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let m = mollusk();
    let (edition_key, _) = edition_pda(id);

    // reject: a Requested cert (student2) closed by an admin.
    let student2 = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &student2,
        &[&student2],
        &[ix_request(&student2.pubkey(), id, &[3u8; 32])],
    )
    .expect("request2");
    let (cert2_key, _) = cert_pda(&edition_key, &student2.pubkey());
    let reject = ix_reject(id, &student2.pubkey(), &env.admin1.pubkey());
    let reject_accts = vec![
        live(&env.svm, &config_pda().0),
        live(&env.svm, &edition_key),
        live(&env.svm, &cert2_key),
        (student2.pubkey(), sol_account(1_000_000_000)),
        (env.admin1.pubkey(), sol_account(1_000_000_000)),
    ];
    ok_cu(&m, &reject, &reject_accts, "reject", cu::REJECT);

    // claim: a FullySigned cert (student1).
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &[9u8; 32])],
    )
    .expect("request");
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s1],
        &[ix_sign(&s1.pubkey(), id, &student.pubkey())],
    )
    .expect("s1");
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s2],
        &[ix_sign(&s2.pubkey(), id, &student.pubkey())],
    )
    .expect("s2");
    let (cert_key, _) = cert_pda(&edition_key, &student.pubkey());
    let artifact = [0xAAu8; 32];
    let claim = ix_claim(&student.pubkey(), &env.notary.pubkey(), id, &artifact);
    let claim_accts = vec![
        (student.pubkey(), sol_account(1_000_000_000)),
        (env.notary.pubkey(), sol_account(1_000_000_000)),
        live(&env.svm, &config_pda().0),
        live(&env.svm, &edition_key),
        live(&env.svm, &cert_key),
        (hash_pda(&artifact).0, sol_account(0)),
        sys_program(),
    ];
    ok_cu(&m, &claim, &claim_accts, "claim", cu::CLAIM);
}

#[test]
fn cu_admin_ops() {
    let mut env = boot();
    let m = mollusk();
    let id = create_open_edition(
        &mut env,
        &[
            (Keypair::new().pubkey(), "A", "x"),
            (Keypair::new().pubkey(), "B", "y"),
        ],
        0,
    );

    // add_admin (2 distinct admins).
    let new_admin = Keypair::new().pubkey();
    let add = ix_add_admin(&new_admin, &[env.admin1.pubkey(), env.admin2.pubkey()]);
    let add_accts = vec![
        live(&env.svm, &config_pda().0),
        (env.admin1.pubkey(), sol_account(1_000_000_000)),
        (env.admin2.pubkey(), sol_account(1_000_000_000)),
    ];
    ok_cu(&m, &add, &add_accts, "add_admin", cu::ADMIN_OP);

    // set_edition_status (1 admin).
    let st = ix_set_edition_status(
        id,
        constants::edition_status::PAUSED,
        &[env.admin1.pubkey()],
    );
    let st_accts = vec![
        live(&env.svm, &config_pda().0),
        live(&env.svm, &edition_pda(id).0),
        (env.admin1.pubkey(), sol_account(1_000_000_000)),
    ];
    ok_cu(&m, &st, &st_accts, "set_status", cu::ADMIN_OP);
}
