//! Pinocchio bug-class suite: owner-before-branch, exact-size, discriminator
//! type confusion, non-canonical PDA at create, junk status byte, and tombstone
//! reuse. Uses LiteSVM `set_account` to forge hostile pre-states.

use {
    certify_tests::*,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
};

/// Drive a fresh edition + one Requested certificate; returns (env, id, s1, student, cert_key).
fn requested() -> (Env, u64, Keypair, Keypair, Pubkey) {
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
    .expect("request");
    let (cert_key, _) = cert_pda(&edition_pda(id).0, &student.pubkey());
    (env, id, s1, student, cert_key)
}

#[test]
fn forged_edition_owner_rejected() {
    let (mut env, id, s1, student, _) = requested();
    // Re-own the edition account to an attacker "program".
    let (edition_key, _) = edition_pda(id);
    let mut ed = env.svm.get_account(&edition_key).unwrap();
    ed.owner = Pubkey::new_unique();
    env.svm.set_account(edition_key, ed).unwrap();
    // Sign must fail at the owner check (before any data branch).
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s1],
            &[ix_sign(&s1.pubkey(), id, &student.pubkey())]
        )
        .is_err(),
        "forged-owner edition must be rejected"
    );
}

#[test]
fn exact_size_enforced() {
    for delta in [1i32, -1] {
        let (mut env, id, s1, student, cert_key) = requested();
        let mut c = env.svm.get_account(&cert_key).unwrap();
        if delta > 0 {
            c.data.push(0);
        } else {
            c.data.pop();
        }
        env.svm.set_account(cert_key, c).unwrap();
        assert!(
            send(
                &mut env.svm,
                &env.payer,
                &[&env.payer, &s1],
                &[ix_sign(&s1.pubkey(), id, &student.pubkey())]
            )
            .is_err(),
            "cert length {delta:+} must be rejected"
        );
    }
}

#[test]
fn wrong_account_type_rejected() {
    let (mut env, _id, s1, _student, cert_key) = requested();
    // Pass the certificate account where the edition is expected (disc 3 ≠ 2).
    let bad = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(s1.pubkey(), true),
            AccountMeta::new_readonly(cert_key, false), // wrong type in edition slot
            AccountMeta::new(cert_key, false),
        ],
        data: vec![8u8],
    };
    assert!(send(&mut env.svm, &env.payer, &[&env.payer, &s1], &[bad]).is_err());
}

#[test]
fn non_canonical_cert_pda_rejected() {
    let (mut env, id, _s1, student, _cert) = requested();
    // Request for a second student but pass a bogus (non-PDA) cert address.
    let s2 = funded_keypair(&mut env.svm, 1_000_000_000);
    let (edition_key, _) = edition_pda(id);
    let wrong = Keypair::new().pubkey();
    let bad = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(s2.pubkey(), true),
            AccountMeta::new(edition_key, false),
            AccountMeta::new(wrong, false), // not the canonical cert PDA
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        data: enc_request(&[5u8; 32]),
    };
    assert!(
        send(&mut env.svm, &s2, &[&s2], &[bad]).is_err(),
        "non-canonical cert PDA must be rejected"
    );
    let _ = student;
}

#[test]
fn junk_status_byte_rejected() {
    let (mut env, id, s1, student, cert_key) = requested();
    // Corrupt the status byte to a junk enum value (valid disc/len/PDA preserved).
    let mut c = env.svm.get_account(&cert_key).unwrap();
    c.data[state::certificate::STATUS] = 99;
    env.svm.set_account(cert_key, c).unwrap();
    // Sign rejects the junk status (a Requested cert would pass; 99 does not).
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s1],
            &[ix_sign(&s1.pubkey(), id, &student.pubkey())]
        )
        .is_err(),
        "junk status must be rejected"
    );
}

#[test]
fn tombstone_blocks_reuse_then_re_request_ok() {
    let (mut env, id, s1, student, cert_key) = requested();
    // Reject (closes the cert) by an admin.
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_reject(id, &student.pubkey(), &env.admin1.pubkey())],
    )
    .expect("reject");
    // The closed cert cannot be signed.
    env.svm.expire_blockhash();
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &s1],
            &[ix_sign(&s1.pubkey(), id, &student.pubkey())]
        )
        .is_err(),
        "closed cert must not be signable"
    );
    // But the student can re-request into the freed slot.
    env.svm.expire_blockhash();
    send(
        &mut env.svm,
        &student,
        &[&student],
        &[ix_request(&student.pubkey(), id, &[2u8; 32])],
    )
    .expect("re-request ok");
    assert_eq!(
        decode_cert(&account_data(&env.svm, &cert_key)).status,
        constants::cert_status::REQUESTED
    );
}
