//! Edition creation validation, sequential ids, supply boundary + freed-slot
//! re-request, and request/sign linkage edges.

use {
    certify_tests::*,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_signer::Signer,
};

fn create_ix_raw(
    payer: solana_pubkey::Pubkey,
    admin: solana_pubkey::Pubkey,
    id: u64,
    data: Vec<u8>,
) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new(payer, true),
            AccountMeta::new(config_pda().0, false),
            AccountMeta::new(edition_pda(id).0, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            AccountMeta::new_readonly(admin, true),
        ],
        data,
    }
}

fn two_signers() -> (Keypair, Keypair, Vec<u8>) {
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let data = enc_create_edition(
        "E",
        &[7u8; 32],
        0,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
    );
    (s1, s2, data)
}

#[test]
fn signer_count_bounds() {
    let mut env = boot();
    // signer_count = 1 (< MIN) rejected.
    let (_s1, _s2, mut d) = two_signers();
    d[105] = 1;
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(env.payer.pubkey(), env.admin1.pubkey(), 0, d)]
        )
        .is_err(),
        "1 signer rejected"
    );
    // signer_count = 7 (> MAX) rejected.
    let (_s1, _s2, mut d) = two_signers();
    d[105] = 7;
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(env.payer.pubkey(), env.admin1.pubkey(), 0, d)]
        )
        .is_err(),
        "7 signers rejected"
    );
}

#[test]
fn duplicate_and_zero_signer_rejected() {
    let mut env = boot();
    // Duplicate signer pubkey.
    let s = Keypair::new();
    let dup = enc_create_edition(
        "E",
        &[7u8; 32],
        0,
        &[(s.pubkey(), "A", "x"), (s.pubkey(), "B", "y")],
    );
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(
                env.payer.pubkey(),
                env.admin1.pubkey(),
                0,
                dup
            )]
        )
        .is_err(),
        "dup signer rejected"
    );
    // Zero pubkey in an active slot.
    let mut z = two_signers().2;
    for b in z[106..138].iter_mut() {
        *b = 0;
    }
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(env.payer.pubkey(), env.admin1.pubkey(), 0, z)]
        )
        .is_err(),
        "zero signer rejected"
    );
}

#[test]
fn zero_spec_hash_and_nonzero_tail_rejected() {
    let mut env = boot();
    // Zero spec_hash.
    let (s1, s2, _) = two_signers();
    let zero_spec = enc_create_edition(
        "E",
        &[0u8; 32],
        0,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
    );
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(
                env.payer.pubkey(),
                env.admin1.pubkey(),
                0,
                zero_spec
            )]
        )
        .is_err(),
        "zero spec_hash rejected"
    );
    // Non-zero byte in an unused tail slot.
    let mut tail = two_signers().2;
    tail[300] = 1; // inside slot 2 (unused when signer_count == 2)
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[create_ix_raw(
                env.payer.pubkey(),
                env.admin1.pubkey(),
                0,
                tail
            )]
        )
        .is_err(),
        "nonzero tail rejected"
    );
}

#[test]
fn sequential_ids() {
    let mut env = boot();
    let s = Keypair::new();
    let a = create_open_edition(
        &mut env,
        &[(s.pubkey(), "A", "x"), (Keypair::new().pubkey(), "B", "y")],
        0,
    );
    let b = create_open_edition(
        &mut env,
        &[(s.pubkey(), "A", "x"), (Keypair::new().pubkey(), "B", "y")],
        0,
    );
    assert_eq!((a, b), (0, 1));
    assert_eq!(
        decode_config(&account_data(&env.svm, &config_pda().0)).editions_created,
        2
    );
}

#[test]
fn request_requires_open_and_nonzero_commitment() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    // Create but leave Paused.
    let id = decode_config(&account_data(&env.svm, &config_pda().0)).editions_created;
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_create_edition(
            &env.payer.pubkey(),
            id,
            "E",
            &[7u8; 32],
            0,
            &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
            &[env.admin1.pubkey()],
        )],
    )
    .expect("create");
    let student = funded_keypair(&mut env.svm, 1_000_000_000);
    // Request on Paused → EditionNotOpen.
    assert!(
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &[9u8; 32])]
        )
        .is_err(),
        "request on Paused rejected"
    );
    // Open, then zero commitment → InvalidCommitment.
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_set_edition_status(
            id,
            constants::edition_status::OPEN,
            &[env.admin1.pubkey()],
        )],
    )
    .expect("open");
    assert!(
        send(
            &mut env.svm,
            &student,
            &[&student],
            &[ix_request(&student.pubkey(), id, &[0u8; 32])]
        )
        .is_err(),
        "zero commitment rejected"
    );
}

#[test]
fn supply_boundary_and_freed_slot() {
    let mut env = boot();
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[(s1.pubkey(), "A", "x"), (s2.pubkey(), "B", "y")],
        2,
    );

    let a = funded_keypair(&mut env.svm, 1_000_000_000);
    let b = funded_keypair(&mut env.svm, 1_000_000_000);
    let c = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &a,
        &[&a],
        &[ix_request(&a.pubkey(), id, &[1u8; 32])],
    )
    .expect("req a");
    send(
        &mut env.svm,
        &b,
        &[&b],
        &[ix_request(&b.pubkey(), id, &[2u8; 32])],
    )
    .expect("req b");
    // Third exceeds max_supply = 2.
    assert!(
        send(
            &mut env.svm,
            &c,
            &[&c],
            &[ix_request(&c.pubkey(), id, &[3u8; 32])]
        )
        .is_err(),
        "supply exhausted"
    );
    // Reject a → frees a slot; c can now request (distinct commitment so it isn't
    // a byte-identical replay of the failed attempt above).
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_reject(id, &a.pubkey(), &env.admin1.pubkey())],
    )
    .expect("reject a");
    send(
        &mut env.svm,
        &c,
        &[&c],
        &[ix_request(&c.pubkey(), id, &[4u8; 32])],
    )
    .expect("re-request into freed slot");

    // set_max_supply below the live count (2) → SupplyExhausted.
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[ix_set_max_supply(id, 1, &[env.admin1.pubkey()])]
        )
        .is_err(),
        "cap below live rejected"
    );
}

#[test]
fn sign_wrong_edition_rejected() {
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
    .expect("request");

    // Sign the id0 cert but present edition id1 → WrongEdition (linkage).
    let (cert0, _) = cert_pda(&edition_pda(id0).0, &student.pubkey());
    let bad = Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(s1.pubkey(), true),
            AccountMeta::new_readonly(edition_pda(id1).0, false),
            AccountMeta::new(cert0, false),
        ],
        data: vec![8u8],
    };
    assert!(
        send(&mut env.svm, &env.payer, &[&env.payer, &s1], &[bad]).is_err(),
        "wrong-edition sign rejected"
    );
}
