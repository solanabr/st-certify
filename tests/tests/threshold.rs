//! Native admin multisig: distinct-signer counting, aliasing, floors, and the
//! add/remove/set_notary threshold classes.

use {certify_tests::*, solana_keypair::Keypair, solana_signer::Signer};

#[test]
fn bootstrap_forced_and_floor() {
    let env = boot();
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    // Provided admin1 + admin2 + forced BOOTSTRAP_ADMIN = 3 (>= MIN_ADMINS).
    assert_eq!(cfg.admin_count, 3);
    assert!(cfg.admins.contains(&constants::BOOTSTRAP_ADMIN));
}

#[test]
fn add_admin_threshold_and_aliasing() {
    let mut env = boot();
    let new = Keypair::new().pubkey();

    // 0 admin signers → fail.
    assert!(send(
        &mut env.svm,
        &env.payer,
        &[&env.payer],
        &[ix_add_admin(&new, &[])]
    )
    .is_err());

    // 1 admin signer → fail (needs 2 distinct).
    assert!(send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_add_admin(&new, &[env.admin1.pubkey()])]
    )
    .is_err());

    // Same admin passed as TWO metas counts once → still fails (aliasing).
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1],
            &[ix_add_admin(
                &new,
                &[env.admin1.pubkey(), env.admin1.pubkey()]
            )]
        )
        .is_err(),
        "[admin1, admin1] must count as one"
    );

    // A non-admin co-signer is ignored → 1 distinct admin → fails.
    let rando = funded_keypair(&mut env.svm, 1_000_000_000);
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1, &rando],
            &[ix_add_admin(&new, &[env.admin1.pubkey(), rando.pubkey()])]
        )
        .is_err(),
        "non-admin signer must not count"
    );

    // 2 distinct admins → succeeds.
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_add_admin(
            &new,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("2 distinct admins ok");
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 4);
    assert!(cfg.admins.contains(&new));

    // Duplicate add → AdminAlreadyExists.
    assert!(send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_add_admin(
            &new,
            &[env.admin1.pubkey(), env.admin2.pubkey()]
        )]
    )
    .is_err());
}

#[test]
fn remove_admin_blocked_below_four() {
    let mut env = boot();
    // Start at 3 admins → removal needs count-1 >= 3 → blocked.
    assert!(
        send(
            &mut env.svm,
            &env.payer,
            &[&env.payer, &env.admin1, &env.admin2],
            &[ix_remove_admin(
                &env.admin2.pubkey(),
                &[env.admin1.pubkey(), env.admin2.pubkey()]
            )]
        )
        .is_err(),
        "remove blocked at 3 admins"
    );

    // Add a 4th, then removal is allowed.
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
    .expect("add 4th");
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_remove_admin(
            &new,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("remove ok at 4");
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 3);
    assert!(!cfg.admins.contains(&new));

    // Removing an unregistered admin → AdminNotFound (add a 4th first so the floor passes).
    let n2 = Keypair::new().pubkey();
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_add_admin(
            &n2,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("add");
    assert!(send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_remove_admin(
            &Keypair::new().pubkey(),
            &[env.admin1.pubkey(), env.admin2.pubkey()]
        )]
    )
    .is_err());
}

#[test]
fn set_notary_threshold() {
    let mut env = boot();
    let new_notary = Keypair::new().pubkey();
    // 1 admin → fail.
    assert!(send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[ix_set_notary(&new_notary, &[env.admin1.pubkey()])]
    )
    .is_err());
    // 2 distinct → ok.
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_set_notary(
            &new_notary,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("set_notary ok");
    assert_eq!(
        decode_config(&account_data(&env.svm, &config_pda().0)).notary,
        new_notary
    );
}

// ── genesis gate: init_config requires the bootstrap recovery key ────────────

#[test]
fn init_config_requires_bootstrap_signer() {
    // Sigverify ON: a permissionless race-winner has no bootstrap secret, so it
    // simply cannot present that signer. The gate rejects before any PDA is made.
    let mut svm = setup();
    let payer = funded_keypair(&mut svm, 100_000_000_000);
    let a1 = Keypair::new();
    let a2 = Keypair::new();
    let notary = Keypair::new();
    let ix = ix_init_config_no_bootstrap_signer(
        &payer.pubkey(),
        &notary.pubkey(),
        &[a1.pubkey(), a2.pubkey()],
    );
    let res = send(&mut svm, &payer, &[&payer], &[ix]);
    assert!(
        is_missing_signature(&res),
        "init without bootstrap must fail MissingRequiredSignature, got {res:?}"
    );
    assert!(
        account_opt(&svm, &config_pda().0).is_none(),
        "no config PDA may exist after a rejected init"
    );
}

#[test]
fn init_config_succeeds_when_bootstrap_signs() {
    let mut svm = setup_no_sigverify();
    let payer = funded_keypair(&mut svm, 100_000_000_000);
    let a1 = Keypair::new();
    let a2 = Keypair::new();
    let notary = Keypair::new();
    let ix = ix_init_config(
        &payer.pubkey(),
        &notary.pubkey(),
        &[a1.pubkey(), a2.pubkey()],
    );
    send_partial(&mut svm, &payer, &[&payer], &[ix]).expect("init with bootstrap signer");
    let cfg = decode_config(&account_data(&svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 3, "a1 + a2 + forced bootstrap");
    assert!(cfg.admins.contains(&constants::BOOTSTRAP_ADMIN));
    assert!(cfg.admins.contains(&a1.pubkey()));
    assert!(cfg.admins.contains(&a2.pubkey()));
    assert_eq!(cfg.notary, notary.pubkey());
}

#[test]
fn bootstrap_admin_cannot_be_removed() {
    let mut env = boot(); // admins: admin1, admin2, BOOTSTRAP (count 3)

    // Add a 4th admin so the floor (count-1 >= MIN_ADMINS_AFTER_REMOVE) permits a
    // removal — isolating the bootstrap guard from the floor check.
    let extra = Keypair::new().pubkey();
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_add_admin(
            &extra,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("add 4th admin");
    assert_eq!(
        decode_config(&account_data(&env.svm, &config_pda().0)).admin_count,
        4
    );

    // Evicting BOOTSTRAP_ADMIN must fail with CannotRemoveBootstrap (floor passes).
    let res = send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_remove_admin(
            &constants::BOOTSTRAP_ADMIN,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    );
    assert_eq!(
        custom_err_code(&res),
        Some(CertifyError::CannotRemoveBootstrap as u32),
        "removing bootstrap must fail CannotRemoveBootstrap, got {res:?}"
    );
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 4, "config unchanged after blocked removal");
    assert!(cfg.admins.contains(&constants::BOOTSTRAP_ADMIN));

    // A NON-bootstrap admin removes fine at the same count → the guard is
    // bootstrap-specific, not a floor artifact.
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1, &env.admin2],
        &[ix_remove_admin(
            &extra,
            &[env.admin1.pubkey(), env.admin2.pubkey()],
        )],
    )
    .expect("removing a non-bootstrap admin at count 4 succeeds");
    let cfg = decode_config(&account_data(&env.svm, &config_pda().0));
    assert_eq!(cfg.admin_count, 3);
    assert!(cfg.admins.contains(&constants::BOOTSTRAP_ADMIN));
    assert!(!cfg.admins.contains(&extra));
}
