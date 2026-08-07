//! Claim/edition/admin backfill (review fix round 1): claim negatives,
//! cert_number sequence, duplicate request, record_asset/revoke guards, the
//! 8-admin cap, a 6-signer Clock-warp walk, and the pre-funded-PDA create branch.

use {
    certify_tests::*,
    constants::cert_status,
    solana_clock::Clock,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

fn warp(svm: &mut litesvm::LiteSVM, ts: i64) {
    let mut c: Clock = svm.get_sysvar();
    c.unix_timestamp = ts;
    svm.set_sysvar(&c);
}

/// Open 2-signer edition + a FullySigned cert for a fresh student. Returns
/// (id, s1, s2, student).
fn fully_signed(env: &mut Env) -> (u64, Keypair, Keypair, Keypair) {
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
    (id, s1, s2, student)
}

#[test]
fn claim_negatives() {
    // wrong notary (signed, but ≠ config.notary) → InvalidNotary.
    {
        let mut env = boot();
        let (id, _s1, _s2, student) = fully_signed(&mut env);
        let wrong = funded_keypair(&mut env.svm, 1_000_000_000);
        assert!(
            send(
                &mut env.svm,
                &student,
                &[&student, &wrong],
                &[ix_claim(&student.pubkey(), &wrong.pubkey(), id, &[1u8; 32])]
            )
            .is_err(),
            "wrong notary"
        );
    }
    // missing notary signature (meta not a signer) → MissingRequiredSignature.
    {
        let mut env = boot();
        let (id, _s1, _s2, student) = fully_signed(&mut env);
        let (edition, _) = edition_pda(id);
        let (cert, _) = cert_pda(&edition, &student.pubkey());
        let (hash, _) = hash_pda(&[1u8; 32]);
        let bad = Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![
                AccountMeta::new(student.pubkey(), true),
                AccountMeta::new_readonly(env.notary.pubkey(), false), // NOT a signer
                AccountMeta::new_readonly(config_pda().0, false),
                AccountMeta::new(edition, false),
                AccountMeta::new(cert, false),
                AccountMeta::new(hash, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            ],
            data: enc_claim(&[1u8; 32]),
        };
        assert!(
            send(&mut env.svm, &student, &[&student], &[bad]).is_err(),
            "missing notary sig"
        );
    }
    // not FullySigned (claim a Requested cert) → InvalidCertStatus.
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
        assert!(
            send(
                &mut env.svm,
                &student,
                &[&student, &env.notary],
                &[ix_claim(
                    &student.pubkey(),
                    &env.notary.pubkey(),
                    id,
                    &[1u8; 32]
                )]
            )
            .is_err(),
            "not fully signed"
        );
    }
    // zero artifact hash → InvalidHash.
    {
        let mut env = boot();
        let (id, _s1, _s2, student) = fully_signed(&mut env);
        assert!(
            send(
                &mut env.svm,
                &student,
                &[&student, &env.notary],
                &[ix_claim(
                    &student.pubkey(),
                    &env.notary.pubkey(),
                    id,
                    &[0u8; 32]
                )]
            )
            .is_err(),
            "zero hash"
        );
    }
}

#[test]
fn claim_wrong_edition_linkage_rejected() {
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
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s1],
        &[ix_sign(&s1.pubkey(), id0, &student.pubkey())],
    )
    .expect("s1");
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &s2],
        &[ix_sign(&s2.pubkey(), id0, &student.pubkey())],
    )
    .expect("s2");
    let (cert0, _) = cert_pda(&edition_pda(id0).0, &student.pubkey());
    let artifact = [0x55u8; 32];

    // Claim cert0 but present edition id1 → cert.edition ≠ edition.address() → WrongEdition.
    let bad = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(student.pubkey(), true),
            AccountMeta::new_readonly(env.notary.pubkey(), true),
            AccountMeta::new_readonly(config_pda().0, false),
            AccountMeta::new(edition_pda(id1).0, false),
            AccountMeta::new(cert0, false),
            AccountMeta::new(hash_pda(&artifact).0, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        data: enc_claim(&artifact),
    };
    assert!(
        send(&mut env.svm, &student, &[&student, &env.notary], &[bad]).is_err(),
        "wrong-edition claim rejected"
    );
}

#[test]
fn cert_number_sequence() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    for n in 1..=3u64 {
        let student = funded_keypair(&mut env.svm, 1_000_000_000);
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &[n as u8; 32])],
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
                &[0x40 + n as u8; 32],
            )],
        )
        .expect("claim");
        let (cert, _) = cert_pda(&edition_pda(id).0, &student.pubkey());
        assert_eq!(
            decode_cert(&account_data(&env.svm, &cert)).cert_number,
            n,
            "cert_number sequence"
        );
    }
}

#[test]
fn duplicate_request_fails() {
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
        &[ix_request(&student.pubkey(), id, &[1u8; 32])],
    )
    .expect("req");
    // Second request (distinct commitment so it isn't a dup-tx) → cert already exists.
    assert!(
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &[2u8; 32])]
        )
        .is_err(),
        "duplicate request fails structurally"
    );
}

#[test]
fn record_asset_and_revoke_guards() {
    let mut env = boot();
    let (id, _s1, _s2, student) = fully_signed(&mut env);
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

    // record_asset by a non-admin signer → fail.
    let rando = funded_keypair(&mut env.svm, 1_000_000_000);
    let asset = Keypair::new().pubkey();
    assert!(
        send(
            &mut env.svm,
            &rando,
            &[&rando],
            &[ix_record_asset(
                id,
                &student.pubkey(),
                &asset,
                &[rando.pubkey()]
            )]
        )
        .is_err(),
        "non-admin record_asset"
    );

    // revoke a Claimed cert needs 2 distinct admins; a non-Claimed cert cannot be revoked.
    let s1b = Keypair::new();
    let s2b = Keypair::new();
    let id2 = create_open_edition(
        &mut env,
        &[(s1b.pubkey(), "A", "x"), (s2b.pubkey(), "B", "y")],
        0,
    );
    let stu2 = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &stu2,
        &[&stu2],
        &[ix_request(&stu2.pubkey(), id2, &[3u8; 32])],
    )
    .expect("req");
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1, &env.admin2],
            &[ix_revoke(
                id2,
                &stu2.pubkey(),
                &[env.admin1.pubkey(), env.admin2.pubkey()]
            )]
        )
        .is_err(),
        "revoke non-Claimed fails"
    );
}

#[test]
fn admin_cap_of_eight() {
    let mut env = boot(); // starts at 3 admins
                          // Add up to 8.
    for i in 0..5u8 {
        let new = Keypair::new().pubkey();
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1, &env.admin2],
            &[ix_add_admin(
                &new,
                &[env.admin1.pubkey(), env.admin2.pubkey()],
            )],
        )
        .unwrap_or_else(|_| panic!("add {i}"));
    }
    assert_eq!(
        decode_config(&account_data(&env.svm, &config_pda().0)).admin_count,
        8
    );
    // Ninth → AdminListFull.
    let new = Keypair::new().pubkey();
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1, &env.admin2],
            &[ix_add_admin(
                &new,
                &[env.admin1.pubkey(), env.admin2.pubkey()]
            )]
        )
        .is_err(),
        "9th admin rejected"
    );
}

#[test]
fn six_signer_walk_with_clock() {
    let mut env = boot();
    let sk: Vec<Keypair> = (0..6).map(|_| Keypair::new()).collect();
    let signers: Vec<(_, &str, &str)> = sk.iter().map(|k| (k.pubkey(), "S", "r")).collect();
    let id = create_open_edition(&mut env, &signers, 0);
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &[9u8; 32])],
    )
    .expect("req");

    let (cert, _) = cert_pda(&edition_pda(id).0, &student.pubkey());
    for (i, k) in sk.iter().enumerate() {
        warp(&mut env.svm, 1000 + i as i64);
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, k],
            &[ix_sign(&k.pubkey(), id, &student.pubkey())],
        )
        .expect("sign");
        let c = decode_cert(&account_data(&env.svm, &cert));
        assert_eq!(c.sig_timestamps[i], 1000 + i as i64, "per-slot timestamp");
        assert_eq!(
            c.signed_mask,
            ((1u16 << (i + 1)) - 1) as u8,
            "cumulative mask"
        );
    }
    let c = decode_cert(&account_data(&env.svm, &cert));
    assert_eq!(c.signed_mask, 0b111111);
    assert_eq!(c.status, cert_status::FULLY_SIGNED);
}

#[test]
fn prefunded_pda_create_branch() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        0,
    );
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    let (cert, _) = cert_pda(&edition_pda(id).0, &student.pubkey());

    // Donate lamports (< rent) to the cert PDA before it exists → forces the
    // Transfer-topup + Allocate + Assign branch of [C].
    env.svm.set_account(cert, sol_account(1000)).unwrap();
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &[9u8; 32])],
    )
    .expect("pre-funded request");
    let c = decode_cert(&account_data(&env.svm, &cert));
    assert_eq!(c.status, cert_status::REQUESTED);
    assert_eq!(c.student, student.pubkey());
    assert_eq!(
        env.svm.get_account(&cert).unwrap().lamports,
        env.svm.minimum_balance_for_rent_exemption(228)
    );
}
