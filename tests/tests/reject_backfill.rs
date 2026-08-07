//! Reject/close backfill (review fix round 1): same-tx revival is blocked,
//! refund lamport accounting, the authz matrix, and whole-tx atomicity when a
//! batch touches a closed cert.

use {
    certify_tests::*,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

/// Fresh Open 2-signer edition + one Requested cert for `student`.
fn requested(env: &mut Env) -> (u64, Keypair, Keypair, Keypair) {
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(env, &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")], 0);
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &[9u8; 32])],
    )
    .expect("request");
    (id, s1, s2, student)
}

#[test]
fn same_tx_reject_then_rerequest_is_blocked() {
    let mut env = boot();
    let (id, _s1, _s2, student) = requested(&mut env);
    let (cert_key, _) = cert_pda(&edition_pda(id).0, &student.pubkey());

    // ONE transaction: reject (closes) then re-request (revive). Must fail whole-tx.
    let reject = ix_reject(id, &student.pubkey(), &env.admin1.pubkey());
    let rerequest = ix_request(&student.pubkey(), id, &[7u8; 32]);
    let r = send(
        &mut env.svm,
        &student,
        &[&student, &env.admin1],
        &[reject, rerequest],
    );
    assert!(
        r.is_err(),
        "same-tx [reject, re-request] must be rejected (no revival)"
    );

    // Whole tx reverted → cert is still the original Requested account.
    assert_eq!(
        decode_cert(&account_data(&env.svm, &cert_key)).status,
        constants::cert_status::REQUESTED
    );
}

#[test]
fn reject_refund_accounting() {
    let mut env = boot();
    let (id, _s1, _s2, student) = requested(&mut env);
    let (cert_key, _) = cert_pda(&edition_pda(id).0, &student.pubkey());

    // Certificate rent (228 B) is pinned by the spec.
    let cert_lamports = env.svm.get_account(&cert_key).unwrap().lamports;
    assert_eq!(cert_lamports, 2_477_760, "Certificate rent");
    assert_eq!(
        cert_lamports,
        env.svm.minimum_balance_for_rent_exemption(228)
    );

    // Reject paid by the admin, so the student only RECEIVES the refund (no fee).
    let before = env.svm.get_balance(&student.pubkey()).unwrap();
    send(
        &mut env.svm,
        &env.admin1,
        &[&env.admin1],
        &[ix_reject(id, &student.pubkey(), &env.admin1.pubkey())],
    )
    .expect("reject");
    let after = env.svm.get_balance(&student.pubkey()).unwrap();
    assert_eq!(
        after,
        before + cert_lamports,
        "student refunded exactly the cert rent"
    );
    // The closed cert account is gone (0 lamports → GC'd at tx end).
    assert!(env
        .svm
        .get_account(&cert_key)
        .map(|a| a.lamports == 0)
        .unwrap_or(true));
}

#[test]
fn reject_authz_matrix() {
    // by an edition signer → ok.
    {
        let mut env = boot();
        let (id, s1, _s2, student) = requested(&mut env);
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s1],
            &[ix_reject(id, &student.pubkey(), &s1.pubkey())],
        )
        .expect("edition signer may reject");
    }
    // by neither signer nor admin → fail.
    {
        let mut env = boot();
        let (id, _s1, _s2, student) = requested(&mut env);
        let rando = funded_keypair(&mut env.svm, 1_000_000_000);
        assert!(
            send(
                &mut env.svm,
                &rando,
                &[&rando],
                &[ix_reject(id, &student.pubkey(), &rando.pubkey())]
            )
            .is_err(),
            "outsider cannot reject"
        );
    }
    // wrong refund account (≠ cert.student) → WrongStudent.
    {
        let mut env = boot();
        let (id, _s1, _s2, student) = requested(&mut env);
        let wrong = Keypair::new().pubkey();
        let bad =
            certify_tests::ix_reject_refund(id, &student.pubkey(), &wrong, &env.admin1.pubkey());
        assert!(
            send(&mut env.svm, &env.admin1, &[&env.admin1], &[bad]).is_err(),
            "wrong refund → WrongStudent"
        );
    }
    // on a Claimed cert → fail (InvalidCertStatus).
    {
        let mut env = boot();
        let s1 = Keypair::new();
        let s2 = Keypair::new();
        let id = create_open_edition(
            &mut env,
            &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
            0,
        );
        let student = funded_keypair(&mut env.svm, 1_000_000_000);
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &[9u8; 32])],
        )
        .expect("req");
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
        send(
            &mut env.svm,
            &student,
            &[&student, &env.notary],
            &[ix_claim(
                &student.pubkey(),
                &env.notary.pubkey(),
                id,
                &[1u8; 32],
            )],
        )
        .expect("claim");
        assert!(
            send(
                &mut env.svm,
                &env.admin1,
                &[&env.admin1],
                &[ix_reject(id, &student.pubkey(), &env.admin1.pubkey())]
            )
            .is_err(),
            "cannot reject a claimed cert"
        );
    }
}

#[test]
fn reject_wrong_edition_linkage_rejected() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id0 = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let id1 = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id0, &[9u8; 32])],
    )
    .expect("req");
    let (cert0, _) = cert_pda(&edition_pda(id0).0, &student.pubkey());

    // Reject cert0 but present edition id1 → cert.edition ≠ edition.address() → WrongEdition.
    let bad = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(config_pda().0, false),
            AccountMeta::new(edition_pda(id1).0, false),
            AccountMeta::new(cert0, false),
            AccountMeta::new(student.pubkey(), false),
            AccountMeta::new_readonly(env.admin1.pubkey(), true),
        ],
        data: enc_reject(),
    };
    assert!(
        send(&mut env.svm, &env.admin1, &[&env.admin1], &[bad]).is_err(),
        "wrong-edition reject rejected"
    );
}

#[test]
fn batch_with_closed_cert_fails_whole_tx() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let alice = funded_keypair(&mut env.svm, 1_000_000_000);
    let bob = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &alice,
        &[&alice],
        &[ix_request(&alice.pubkey(), id, &[1u8; 32])],
    )
    .expect("req alice");
    send(
        &mut env.svm,
        &bob,
        &[&bob],
        &[ix_request(&bob.pubkey(), id, &[2u8; 32])],
    )
    .expect("req bob");

    // Close bob's cert (cross-tx).
    send(
        &mut env.svm,
        &env.admin1,
        &[&env.admin1],
        &[ix_reject(id, &bob.pubkey(), &env.admin1.pubkey())],
    )
    .expect("reject bob");

    // Batch: sign alice (ok) then sign bob (closed → gone). Whole tx must fail atomically.
    env.svm.expire_blockhash();
    let batch = [
        ix_sign(&s1.pubkey(), id, &alice.pubkey()),
        ix_sign(&s1.pubkey(), id, &bob.pubkey()),
    ];
    assert!(
        send(&mut env.svm, &env.payer, &[&env.payer, &s1], &batch).is_err(),
        "batch touching a closed cert fails"
    );
    // Atomic: alice's sign was rolled back.
    let (cert_a, _) = cert_pda(&edition_pda(id).0, &alice.pubkey());
    assert_eq!(
        decode_cert(&account_data(&env.svm, &cert_a)).signed_mask,
        0,
        "alice sign rolled back"
    );
}
