//! Golden-vector generator: drives real account states in LiteSVM and dumps raw
//! account bytes (hex) + a manifest of expected decoded fields to
//! `<repo>/tests/golden/`. The TS client's `golden.test.ts` reads these read-only
//! and auto-unskips, cross-validating its decoders against the bytes THIS program
//! actually writes. Schema: packages/certify-client/golden/README.md.

use {
    certify_tests::*,
    serde_json::json,
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    std::{fs, path::PathBuf},
};

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("golden")
}

fn dump(dir: &std::path::Path, name: &str, svm: &litesvm::LiteSVM, key: &Pubkey) {
    let data = account_data(svm, key);
    fs::write(dir.join(format!("{name}.hex")), hex(&data)).expect("write hex");
}

#[test]
fn dump_golden_vectors() {
    let dir = golden_dir();
    fs::create_dir_all(&dir).expect("mkdir golden");

    let mut env = boot();
    let (config_key, _) = config_pda();

    // 1. config.default — right after boot (editions_created = 0).
    dump(&dir, "config.default", &env.svm, &config_key);

    // 2. edition.3signers — a fresh 3-signer edition, Open, id 0.
    let s1 = Keypair::new();
    let s2 = Keypair::new();
    let s3 = Keypair::new();
    let id = create_open_edition(
        &mut env,
        &[
            (s1.pubkey(), "Alice", "Instructor"),
            (s2.pubkey(), "Bob", "Dean"),
            (s3.pubkey(), "Carol", "Registrar"),
        ],
        0,
    );
    let (edition_key, _) = edition_pda(id);
    dump(&dir, "edition.3signers", &env.svm, &edition_key);

    let sign_all = |env: &mut Env, student: &Pubkey| {
        for s in [&s1, &s2, &s3] {
            send(
                &mut env.svm,
                &env.payer,
                &[&env.payer, s],
                &[ix_sign(&s.pubkey(), id, student)],
            )
            .expect("sign");
        }
    };

    // 3. certificate.requested — student A, request only.
    let a = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &a,
        &[&a],
        &[ix_request(&a.pubkey(), id, &[0x11; 32])],
    )
    .expect("req a");
    let (cert_a, _) = cert_pda(&edition_key, &a.pubkey());
    dump(&dir, "certificate.requested", &env.svm, &cert_a);

    // 4. certificate.fullysigned — student B, request + 3 signs (mask 0b111 = 7).
    let b = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &b,
        &[&b],
        &[ix_request(&b.pubkey(), id, &[0x22; 32])],
    )
    .expect("req b");
    sign_all(&mut env, &b.pubkey());
    let (cert_b, _) = cert_pda(&edition_key, &b.pubkey());
    dump(&dir, "certificate.fullysigned", &env.svm, &cert_b);

    // 5. certificate.claimed (+ hashindex) — student C, full flow.
    let c = funded_keypair(&mut env.svm, 1_000_000_000);
    send(
        &mut env.svm,
        &c,
        &[&c],
        &[ix_request(&c.pubkey(), id, &[0x33; 32])],
    )
    .expect("req c");
    sign_all(&mut env, &c.pubkey());
    let artifact = [0xAB; 32];
    send(
        &mut env.svm,
        &c,
        &[&c, &env.notary],
        &[ix_claim(&c.pubkey(), &env.notary.pubkey(), id, &artifact)],
    )
    .expect("claim c");
    let (cert_c, _) = cert_pda(&edition_key, &c.pubkey());
    let (hash_key, _) = hash_pda(&artifact);
    dump(&dir, "certificate.claimed", &env.svm, &cert_c);
    dump(&dir, "hashindex", &env.svm, &hash_key);

    // Manifest: expected decoded fields in the client's schema (u64 → strings,
    // addresses → base58, status → name, masks → numbers). `pda` is entry-level
    // metadata (ignored by the decoder assertions).
    let manifest = json!({
        "config.default": {
            "account": "config",
            "pda": config_key.to_string(),
            "expected": {
                "adminCount": 3,
                "notary": env.notary.pubkey().to_string(),
                "editionsCreated": "0"
            }
        },
        "edition.3signers": {
            "account": "edition",
            "pda": edition_key.to_string(),
            "expected": {
                "status": "Open",
                "signerCount": 3,
                "id": "0",
                "name": "Test Edition",
                "maxSupply": "0",
                "certsRequested": "0",
                "certsClosed": "0",
                "certsClaimed": "0"
            }
        },
        "certificate.requested": {
            "account": "certificate",
            "pda": cert_a.to_string(),
            "expected": {
                "status": "Requested",
                "signedMask": 0,
                "edition": edition_key.to_string(),
                "student": a.pubkey().to_string()
            }
        },
        "certificate.fullysigned": {
            "account": "certificate",
            "pda": cert_b.to_string(),
            "expected": {
                "status": "FullySigned",
                "signedMask": 7,
                "student": b.pubkey().to_string()
            }
        },
        "certificate.claimed": {
            "account": "certificate",
            "pda": cert_c.to_string(),
            "expected": {
                "status": "Claimed",
                "signedMask": 7,
                "certNumber": "1",
                "student": c.pubkey().to_string()
            }
        },
        "hashindex": {
            "account": "hashIndex",
            "pda": hash_key.to_string(),
            "expected": {
                "certificate": cert_c.to_string()
            }
        }
    });
    fs::write(
        dir.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap(),
    )
    .expect("write manifest");

    // Sanity: our own decoders agree with what we asserted (byte parity check).
    assert_eq!(
        decode_config(&account_data(&env.svm, &config_key)).editions_created,
        1
    );
    assert_eq!(
        decode_edition(&account_data(&env.svm, &edition_key)).signer_count,
        3
    );
    assert_eq!(
        decode_cert(&account_data(&env.svm, &cert_b)).signed_mask,
        0b111
    );
    assert_eq!(decode_cert(&account_data(&env.svm, &cert_c)).cert_number, 1);
    assert_eq!(
        decode_hash_index(&account_data(&env.svm, &hash_key)).certificate,
        cert_c
    );
}
