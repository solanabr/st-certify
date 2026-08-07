//! Full certificate lifecycle: init → create/open edition → request → sign(×2)
//! with a Clock warp → claim → verify-by-hash → record_asset → revoke, plus the
//! singleton, double-claim and duplicate-artifact negatives.

use {
    certify_tests::*,
    constants::{cert_status, edition_status},
    solana_clock::Clock,
    solana_keypair::Keypair,
    solana_signer::Signer,
};

#[test]
fn full_lifecycle() {
    let mut env = boot();

    // Config: two provided admins + forced BOOTSTRAP = 3; notary recorded.
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 3);
    assert_eq!(cfg.notary, env.notary.pubkey());
    assert!(cfg.admins.contains(&env.admin1.pubkey()));
    assert_eq!(cfg.editions_created, 0);

    // Edition with two signers, created Paused then Opened.
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[
            (s1.pubkey(), "Alice", "Instructor"),
            (s2.pubkey(), "Bob", "Dean"),
        ],
        0,
    );
    assert_eq!(id, 0);
    let ed = decode_edition(&account_data(&env.svm, &edition_pda(id).0));
    assert_eq!(ed.status, edition_status::OPEN);
    assert_eq!(ed.signer_count, 2);
    assert_eq!(ed.signers, vec![s1.pubkey(), s2.pubkey()]);
    assert_eq!(ed.certs_requested, 0);

    // Student requests a certificate.
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    let commitment = [9u8; 32];
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &commitment)],
    )
    .expect("request");
    let (cert_key, _) = cert_pda(&edition_pda(id).0, &student.pubkey());
    let c = decode_cert(&account_data(&env.svm, &cert_key));
    assert_eq!(c.status, cert_status::REQUESTED);
    assert_eq!(c.signed_mask, 0);
    assert_eq!(c.student, student.pubkey());
    assert_eq!(c.name_commitment, commitment);
    assert_eq!(
        decode_edition(&account_data(&env.svm, &edition_pda(id).0)).certs_requested,
        1
    );

    // First signer signs (at t=1000).
    warp_clock(&mut env.svm, 1000);
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s1],
        &[ix_sign(&s1.pubkey(), id, &student.pubkey())],
    )
    .expect("sign s1");
    let c = decode_cert(&account_data(&env.svm, &cert_key));
    assert_eq!(c.signed_mask, 0b01);
    assert_eq!(
        c.status,
        cert_status::REQUESTED,
        "PartiallySigned is derived, not stored"
    );
    assert_eq!(c.sig_timestamps[0], 1000);

    // Second signer signs (at t=2000) → FullySigned.
    warp_clock(&mut env.svm, 2000);
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s2],
        &[ix_sign(&s2.pubkey(), id, &student.pubkey())],
    )
    .expect("sign s2");
    let c = decode_cert(&account_data(&env.svm, &cert_key));
    assert_eq!(c.signed_mask, 0b11);
    assert_eq!(c.status, cert_status::FULLY_SIGNED);
    assert_eq!(c.sig_timestamps[1], 2000);

    // Re-sign is a byte-identical no-op (fresh blockhash so it isn't a dup tx).
    let before = account_data(&env.svm, &cert_key);
    env.svm.expire_blockhash();
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s1],
        &[ix_sign(&s1.pubkey(), id, &student.pubkey())],
    )
    .expect("re-sign no-op");
    assert_eq!(
        account_data(&env.svm, &cert_key),
        before,
        "re-sign must not mutate state"
    );

    // Claim (student + notary).
    warp_clock(&mut env.svm, 3000);
    let artifact = [0xABu8; 32];
    send(
        &mut env.svm,
        &student,
        &[&student, &env.notary],
        &[ix_claim(
            &student.pubkey(),
            &env.notary.pubkey(),
            id,
            &artifact,
        )],
    )
    .expect("claim");
    let c = decode_cert(&account_data(&env.svm, &cert_key));
    assert_eq!(c.status, cert_status::CLAIMED);
    assert_eq!(c.cert_number, 1);
    assert_eq!(c.artifact_hash, artifact);
    assert_eq!(c.claimed_at, 3000);
    assert_eq!(
        decode_edition(&account_data(&env.svm, &edition_pda(id).0)).certs_claimed,
        1
    );

    // Verify-by-hash round trip: HashIndex(hash) → cert.
    let hi = decode_hash_index(&account_data(&env.svm, &hash_pda(&artifact).0));
    assert_eq!(hi.certificate, cert_key);

    // Double claim fails (not FullySigned anymore).
    assert!(
        send(
            &mut env.svm,
            &student,
            &[&student, &env.notary],
            &[ix_claim(
                &student.pubkey(),
                &env.notary.pubkey(),
                id,
                &[0xCDu8; 32]
            )]
        )
        .is_err(),
        "double claim must fail"
    );

    // record_asset (1 admin, set-once).
    let asset = Keypair::new().pubkey();
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_record_asset(
            id,
            &student.pubkey(),
            &asset,
            &[env.admin1.pubkey()],
        )],
    )
    .expect("record_asset");
    assert_eq!(decode_cert(&account_data(&env.svm, &cert_key)).asset, asset);
    // set-once: second attempt fails.
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[ix_record_asset(
                id,
                &student.pubkey(),
                &Keypair::new().pubkey(),
                &[env.admin1.pubkey()]
            )]
        )
        .is_err(),
        "record_asset is set-once"
    );

    // Revoke needs 2 distinct admins.
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[ix_revoke(id, &student.pubkey(), &[env.admin1.pubkey()])]
        )
        .is_err(),
        "revoke with 1 admin must fail"
    );
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_revoke(
            id,
            &student.pubkey(),
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("revoke with 2 admins");
    assert_eq!(
        decode_cert(&account_data(&env.svm, &cert_key)).status,
        cert_status::REVOKED
    );

    // Post-revoke, HashIndex still resolves.
    assert_eq!(
        decode_hash_index(&account_data(&env.svm, &hash_pda(&artifact).0)).certificate,
        cert_key
    );
}

#[test]
fn config_is_singleton() {
    let mut env = boot();
    // Re-init must fail (config already exists).
    let ix = ix_init_config(
        &env.payer.pubkey(),
        &env.notary.pubkey(),
        &[env.admin1.pubkey()],
    );
    assert!(
        send(&mut env.svm, &env.payer, &[&env.payer], &[ix]).is_err(),
        "re-init must fail"
    );
}

#[test]
fn duplicate_artifact_hash_rejected() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );

    // Two students, both fully signed, same artifact hash on claim.
    let artifact = [0x11u8; 32];
    for (i, commit) in [[1u8; 32], [2u8; 32]].into_iter().enumerate() {
        let student = funded_keypair(&mut env.svm, 1_000_000_000);
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &commit)],
        )
        .expect("request");
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s1],
            &[ix_sign(&s1.pubkey(), id, &student.pubkey())],
        )
        .expect("sign s1");
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s2],
            &[ix_sign(&s2.pubkey(), id, &student.pubkey())],
        )
        .expect("sign s2");
        let r = send(
            &mut env.svm,
            &student,
            &[&student, &env.notary],
            &[ix_claim(
                &student.pubkey(),
                &env.notary.pubkey(),
                id,
                &artifact,
            )],
        );
        if i == 0 {
            r.expect("first claim ok");
        } else {
            assert!(r.is_err(), "second claim with same artifact_hash must fail");
        }
    }
}

fn warp_clock(svm: &mut litesvm::LiteSVM, ts: i64) {
    let mut clock: Clock = svm.get_sysvar();
    clock.unix_timestamp = ts;
    svm.set_sysvar(&clock);
}
