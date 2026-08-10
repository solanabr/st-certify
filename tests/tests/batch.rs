//! 20-signature batch in a single transaction: serialized < 1232 bytes, whole-tx
//! success, and compute_units_consumed ≤ the 110k client budget.

use {
    certify_tests::*, solana_keypair::Keypair, solana_signer::Signer,
    solana_transaction::Transaction,
};

#[test]
fn batch_20_signs_under_budget() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );

    // 20 students each request a certificate.
    let mut students = Vec::new();
    for i in 0..20u8 {
        let st = funded_keypair(&mut env.svm, 1_000_000_000);
        send(
            &mut env.svm,
            &st,
            &[&st],
            &[ix_request(&st.pubkey(), id, &[i + 1; 32])],
        )
        .expect("request");
        students.push(st);
    }

    // One signer signs all 20 certs in a single transaction.
    let ixs: Vec<_> = students
        .iter()
        .map(|st| ix_sign(&s1.pubkey(), id, &st.pubkey()))
        .collect();
    let t = Transaction::new_signed_with_payer(
        &ixs,
        Some(&env.payer.pubkey()),
        &[&env.payer, &s1],
        env.svm.latest_blockhash(),
    );

    let size = 1 + t.signatures.len() * 64 + t.message.serialize().len();
    println!("[batch] 20-ix serialized = {size} bytes");
    assert!(size < 1232, "serialized {size} must be < 1232");

    let meta = env.svm.send_transaction(t).expect("batch tx must succeed");
    println!("[batch] 20-ix CU = {}", meta.compute_units_consumed);
    assert!(
        meta.compute_units_consumed <= 110_000,
        "batch CU {} exceeded 110k",
        meta.compute_units_consumed
    );

    // Every cert carries signer-0's bit.
    for st in &students {
        let (cert, _) = cert_pda(&edition_pda(id).0, &st.pubkey());
        assert_eq!(
            decode_cert(&account_data(&env.svm, &cert)).signed_mask,
            0b01
        );
    }
}
