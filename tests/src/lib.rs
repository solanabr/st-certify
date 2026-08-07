//! Test harness for the `certify` program.
//!
//! `solana_pubkey::Pubkey` is a re-export of `solana_address::Address`, so the
//! same type flows through LiteSVM (`Address`), Mollusk (`Pubkey`), and
//! `certify::ID` with no conversions. Instruction encoders here mirror the
//! byte-exact §3 layouts the on-chain handlers decode (disc at [0], payload from
//! [1]); account decoders read fields at the program's own offset constants, so
//! any layout drift fails a test.

use {
    litesvm::LiteSVM,
    mollusk_svm::Mollusk,
    solana_account::Account,
    solana_instruction::{AccountMeta, Instruction},
    solana_keypair::Keypair,
    solana_pubkey::Pubkey,
    solana_signer::Signer,
    solana_transaction::Transaction,
    std::path::PathBuf,
};

pub use certify::{constants, error::CertifyError, state};

/// Program id (== `certify::ID`, an `Address` == `Pubkey`).
pub const PROGRAM_ID: Pubkey = certify::ID;

/// System program.
pub const SYSTEM_PROGRAM: Pubkey = Pubkey::from_str_const("11111111111111111111111111111111");

/// Per-instruction CU ceilings (appendix §7), asserted by the Mollusk gate.
pub mod cu {
    pub const SIGN: u64 = 5_000;
    pub const REQUEST: u64 = 12_000;
    pub const CLAIM: u64 = 15_000;
    pub const CREATE_EDITION: u64 = 12_000;
    pub const INIT_CONFIG: u64 = 10_000;
    pub const REJECT: u64 = 8_000;
    pub const ADMIN_OP: u64 = 5_000;
    pub const BATCH_20: u64 = 110_000;
}

// ── artifact discovery ──────────────────────────────────────────────────────

/// Absolute path to the compiled program `.so` (workspace `target/deploy`).
pub fn so_path() -> PathBuf {
    // tests/ -> workspace root -> target/deploy/certify.so
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("target")
        .join("deploy")
        .join("certify.so")
}

/// Directory Mollusk searches for `certify.so`.
pub fn deploy_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("target")
        .join("deploy")
}

// ── environment setup ───────────────────────────────────────────────────────

/// Fresh LiteSVM with the program loaded.
pub fn setup() -> LiteSVM {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(PROGRAM_ID, so_path())
        .expect("load certify.so — run `cargo build-sbf` first");
    svm
}

/// Fund a fresh keypair.
pub fn funded_keypair(svm: &mut LiteSVM, lamports: u64) -> Keypair {
    let kp = Keypair::new();
    svm.airdrop(&kp.pubkey(), lamports).expect("airdrop");
    kp
}

/// Mollusk instance for CU gating (loads `certify.so` from `target/deploy`).
pub fn mollusk() -> Mollusk {
    std::env::set_var("SBF_OUT_DIR", deploy_dir());
    Mollusk::new(&PROGRAM_ID, "certify")
}

// ── PDA derivation ──────────────────────────────────────────────────────────

pub fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[constants::seeds::CONFIG], &PROGRAM_ID)
}
pub fn edition_pda(id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[constants::seeds::EDITION, &id.to_le_bytes()], &PROGRAM_ID)
}
pub fn cert_pda(edition: &Pubkey, student: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[constants::seeds::CERT, edition.as_ref(), student.as_ref()],
        &PROGRAM_ID,
    )
}
pub fn hash_pda(artifact_hash: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[constants::seeds::HASH, artifact_hash], &PROGRAM_ID)
}

// ── instruction-data encoders (byte-exact §3, disc at [0]) ──────────────────

pub fn enc_init_config(notary: &Pubkey, admins: &[Pubkey]) -> Vec<u8> {
    // [0][notary 32][count 1][admins 8*32] = 290
    let mut d = vec![0u8; 290];
    d[0] = 0;
    d[1..33].copy_from_slice(notary.as_ref());
    d[33] = admins.len() as u8;
    for (i, a) in admins.iter().enumerate() {
        d[34 + i * 32..34 + i * 32 + 32].copy_from_slice(a.as_ref());
    }
    d
}
pub fn enc_add_admin(new: &Pubkey) -> Vec<u8> {
    let mut d = vec![1u8];
    d.extend_from_slice(new.as_ref());
    d
}
pub fn enc_remove_admin(admin: &Pubkey) -> Vec<u8> {
    let mut d = vec![2u8];
    d.extend_from_slice(admin.as_ref());
    d
}
pub fn enc_set_notary(notary: &Pubkey) -> Vec<u8> {
    let mut d = vec![3u8];
    d.extend_from_slice(notary.as_ref());
    d
}
/// `signers`: up to 6 (pubkey, name, role) triples; `name`/`role` truncated/zero-padded.
pub fn enc_create_edition(
    name: &str,
    spec_hash: &[u8; 32],
    max_supply: u64,
    signers: &[(Pubkey, &str, &str)],
) -> Vec<u8> {
    // [4][name 64][spec_hash 32][max_supply 8][signer_count 1][slots 6*88] = 634
    let mut d = vec![0u8; 634];
    d[0] = 4;
    put_fixed(&mut d[1..65], name.as_bytes());
    d[65..97].copy_from_slice(spec_hash);
    d[97..105].copy_from_slice(&max_supply.to_le_bytes());
    d[105] = signers.len() as u8;
    for (i, (pk, nm, role)) in signers.iter().enumerate() {
        let base = 106 + i * 88;
        d[base..base + 32].copy_from_slice(pk.as_ref());
        put_fixed(&mut d[base + 32..base + 64], nm.as_bytes());
        put_fixed(&mut d[base + 64..base + 88], role.as_bytes());
    }
    d
}
pub fn enc_set_edition_status(status: u8) -> Vec<u8> {
    vec![5u8, status]
}
pub fn enc_set_max_supply(max: u64) -> Vec<u8> {
    let mut d = vec![6u8];
    d.extend_from_slice(&max.to_le_bytes());
    d
}
pub fn enc_request(commitment: &[u8; 32]) -> Vec<u8> {
    let mut d = vec![7u8];
    d.extend_from_slice(commitment);
    d
}
pub fn enc_sign() -> Vec<u8> {
    vec![8u8]
}
pub fn enc_reject() -> Vec<u8> {
    vec![9u8]
}
pub fn enc_claim(artifact_hash: &[u8; 32]) -> Vec<u8> {
    let mut d = vec![10u8];
    d.extend_from_slice(artifact_hash);
    d
}
pub fn enc_record_asset(asset: &Pubkey) -> Vec<u8> {
    let mut d = vec![11u8];
    d.extend_from_slice(asset.as_ref());
    d
}
pub fn enc_revoke() -> Vec<u8> {
    vec![12u8]
}

fn put_fixed(dst: &mut [u8], src: &[u8]) {
    let n = src.len().min(dst.len());
    dst[..n].copy_from_slice(&src[..n]);
}

// ── instruction builders (accounts in §3 normative order) ───────────────────

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    }
}
fn admin_metas(admins: &[Pubkey]) -> Vec<AccountMeta> {
    admins
        .iter()
        .map(|a| AccountMeta::new_readonly(*a, true))
        .collect()
}

pub fn ix_init_config(payer: &Pubkey, notary: &Pubkey, admins: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    ix(
        vec![
            AccountMeta::new(*payer, true),
            AccountMeta::new(config, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        enc_init_config(notary, admins),
    )
}
pub fn ix_add_admin(new: &Pubkey, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let mut m = vec![AccountMeta::new(config, false)];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_add_admin(new))
}
pub fn ix_remove_admin(target: &Pubkey, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let mut m = vec![AccountMeta::new(config, false)];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_remove_admin(target))
}
pub fn ix_set_notary(notary: &Pubkey, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let mut m = vec![AccountMeta::new(config, false)];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_set_notary(notary))
}
pub fn ix_create_edition(
    payer: &Pubkey,
    id: u64,
    name: &str,
    spec_hash: &[u8; 32],
    max_supply: u64,
    signers: &[(Pubkey, &str, &str)],
    admin_signers: &[Pubkey],
) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let mut m = vec![
        AccountMeta::new(*payer, true),
        AccountMeta::new(config, false),
        AccountMeta::new(edition, false),
        AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
    ];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_create_edition(name, spec_hash, max_supply, signers))
}
pub fn ix_set_edition_status(id: u64, status: u8, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let mut m = vec![
        AccountMeta::new_readonly(config, false),
        AccountMeta::new(edition, false),
    ];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_set_edition_status(status))
}
pub fn ix_set_max_supply(id: u64, max: u64, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let mut m = vec![
        AccountMeta::new_readonly(config, false),
        AccountMeta::new(edition, false),
    ];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_set_max_supply(max))
}
pub fn ix_request(student: &Pubkey, id: u64, commitment: &[u8; 32]) -> Instruction {
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    ix(
        vec![
            AccountMeta::new(*student, true),
            AccountMeta::new(edition, false),
            AccountMeta::new(cert, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        enc_request(commitment),
    )
}
pub fn ix_sign(signer: &Pubkey, id: u64, student: &Pubkey) -> Instruction {
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    ix(
        vec![
            AccountMeta::new_readonly(*signer, true),
            AccountMeta::new_readonly(edition, false),
            AccountMeta::new(cert, false),
        ],
        enc_sign(),
    )
}
pub fn ix_reject(id: u64, student: &Pubkey, authority: &Pubkey) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    ix(
        vec![
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(edition, false),
            AccountMeta::new(cert, false),
            AccountMeta::new(*student, false), // student_refund (address-targeted, no sig)
            AccountMeta::new_readonly(*authority, true),
        ],
        enc_reject(),
    )
}
pub fn ix_claim(
    student: &Pubkey,
    notary: &Pubkey,
    id: u64,
    artifact_hash: &[u8; 32],
) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    let (hash_index, _) = hash_pda(artifact_hash);
    ix(
        vec![
            AccountMeta::new(*student, true),
            AccountMeta::new_readonly(*notary, true),
            AccountMeta::new_readonly(config, false),
            AccountMeta::new(edition, false),
            AccountMeta::new(cert, false),
            AccountMeta::new(hash_index, false),
            AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
        ],
        enc_claim(artifact_hash),
    )
}
pub fn ix_record_asset(
    id: u64,
    student: &Pubkey,
    asset: &Pubkey,
    admin_signers: &[Pubkey],
) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    let mut m = vec![
        AccountMeta::new_readonly(config, false),
        AccountMeta::new(cert, false),
    ];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_record_asset(asset))
}
pub fn ix_revoke(id: u64, student: &Pubkey, admin_signers: &[Pubkey]) -> Instruction {
    let (config, _) = config_pda();
    let (edition, _) = edition_pda(id);
    let (cert, _) = cert_pda(&edition, student);
    let mut m = vec![
        AccountMeta::new_readonly(config, false),
        AccountMeta::new(cert, false),
    ];
    m.extend(admin_metas(admin_signers));
    ix(m, enc_revoke())
}

// ── tx helpers ──────────────────────────────────────────────────────────────

/// Build+sign a transaction over `ixs`, signed by `signers` (payer first).
pub fn tx(
    svm: &LiteSVM,
    payer: &Keypair,
    signers: &[&Keypair],
    ixs: &[Instruction],
) -> Transaction {
    Transaction::new_signed_with_payer(ixs, Some(&payer.pubkey()), signers, svm.latest_blockhash())
}

// ── account decoders (read at the program's own offsets) ────────────────────

pub struct ConfigView {
    pub bump: u8,
    pub admin_count: u8,
    pub notary: Pubkey,
    pub admins: Vec<Pubkey>,
    pub editions_created: u64,
}
pub fn decode_config(data: &[u8]) -> ConfigView {
    use state::config as c;
    assert_eq!(data.len(), c::LEN, "config length");
    assert_eq!(data[state::DISC], constants::disc::CONFIG, "config disc");
    let admin_count = data[c::ADMIN_COUNT];
    let admins = (0..admin_count as usize)
        .map(|i| pk(&data[c::ADMINS + i * 32..c::ADMINS + i * 32 + 32]))
        .collect();
    ConfigView {
        bump: data[state::BUMP],
        admin_count,
        notary: pk(&data[c::NOTARY..c::NOTARY + 32]),
        admins,
        editions_created: le_u64(&data[c::EDITIONS_CREATED..]),
    }
}

pub struct EditionView {
    pub bump: u8,
    pub status: u8,
    pub signer_count: u8,
    pub id: u64,
    pub spec_hash: [u8; 32],
    pub signers: Vec<Pubkey>,
    pub max_supply: u64,
    pub certs_requested: u64,
    pub certs_closed: u64,
    pub certs_claimed: u64,
    pub created_at: i64,
}
pub fn decode_edition(data: &[u8]) -> EditionView {
    use state::edition as e;
    assert_eq!(data.len(), e::LEN, "edition length");
    assert_eq!(data[state::DISC], constants::disc::EDITION, "edition disc");
    let signer_count = data[e::SIGNER_COUNT];
    let signers = (0..signer_count as usize)
        .map(|i| pk(&data[e::SIGNERS + i * e::SIGNER_SIZE..e::SIGNERS + i * e::SIGNER_SIZE + 32]))
        .collect();
    EditionView {
        bump: data[state::BUMP],
        status: data[e::STATUS],
        signer_count,
        id: le_u64(&data[e::ID..]),
        spec_hash: arr32(&data[e::SPEC_HASH..]),
        signers,
        max_supply: le_u64(&data[e::MAX_SUPPLY..]),
        certs_requested: le_u64(&data[e::CERTS_REQUESTED..]),
        certs_closed: le_u64(&data[e::CERTS_CLOSED..]),
        certs_claimed: le_u64(&data[e::CERTS_CLAIMED..]),
        created_at: le_i64(&data[e::CREATED_AT..]),
    }
}

pub struct CertView {
    pub bump: u8,
    pub status: u8,
    pub signed_mask: u8,
    pub edition: Pubkey,
    pub student: Pubkey,
    pub name_commitment: [u8; 32],
    pub artifact_hash: [u8; 32],
    pub asset: Pubkey,
    pub cert_number: u64,
    pub sig_timestamps: [i64; 6],
    pub claimed_at: i64,
}
pub fn decode_cert(data: &[u8]) -> CertView {
    use state::certificate as c;
    assert_eq!(data.len(), c::LEN, "cert length");
    assert_eq!(data[state::DISC], constants::disc::CERTIFICATE, "cert disc");
    let mut sig_timestamps = [0i64; 6];
    for (i, slot) in sig_timestamps.iter_mut().enumerate() {
        *slot = le_i64(&data[c::SIG_TIMESTAMPS + i * 8..]);
    }
    CertView {
        bump: data[state::BUMP],
        status: data[c::STATUS],
        signed_mask: data[c::SIGNED_MASK],
        edition: pk(&data[c::EDITION..c::EDITION + 32]),
        student: pk(&data[c::STUDENT..c::STUDENT + 32]),
        name_commitment: arr32(&data[c::NAME_COMMITMENT..]),
        artifact_hash: arr32(&data[c::ARTIFACT_HASH..]),
        asset: pk(&data[c::ASSET..c::ASSET + 32]),
        cert_number: le_u64(&data[c::CERT_NUMBER..]),
        sig_timestamps,
        claimed_at: le_i64(&data[c::CLAIMED_AT..]),
    }
}

pub struct HashIndexView {
    pub bump: u8,
    pub certificate: Pubkey,
}
pub fn decode_hash_index(data: &[u8]) -> HashIndexView {
    use state::hash_index as h;
    assert_eq!(data.len(), h::LEN, "hash_index length");
    assert_eq!(data[state::DISC], constants::disc::HASH_INDEX, "hash disc");
    HashIndexView {
        bump: data[state::BUMP],
        certificate: pk(&data[h::CERTIFICATE..h::CERTIFICATE + 32]),
    }
}

// ── low-level helpers ───────────────────────────────────────────────────────

pub fn account_data(svm: &LiteSVM, key: &Pubkey) -> Vec<u8> {
    svm.get_account(key).expect("account exists").data
}
pub fn account_opt(svm: &LiteSVM, key: &Pubkey) -> Option<Account> {
    svm.get_account(key)
}

fn pk(b: &[u8]) -> Pubkey {
    let mut a = [0u8; 32];
    a.copy_from_slice(&b[..32]);
    Pubkey::new_from_array(a)
}
fn arr32(b: &[u8]) -> [u8; 32] {
    let mut a = [0u8; 32];
    a.copy_from_slice(&b[..32]);
    a
}
fn le_u64(b: &[u8]) -> u64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(&b[..8]);
    u64::from_le_bytes(a)
}
fn le_i64(b: &[u8]) -> i64 {
    let mut a = [0u8; 8];
    a.copy_from_slice(&b[..8]);
    i64::from_le_bytes(a)
}

// ── scenario helpers ────────────────────────────────────────────────────────

/// A booted environment: config initialized with two spendable admin keypairs
/// (`admin1`, `admin2`) plus the forced BOOTSTRAP_ADMIN, and a `notary`.
pub struct Env {
    pub svm: LiteSVM,
    pub payer: Keypair,
    pub admin1: Keypair,
    pub admin2: Keypair,
    pub notary: Keypair,
}

/// Build+sign+send in one call.
pub fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    signers: &[&Keypair],
    ixs: &[Instruction],
) -> litesvm::types::TransactionResult {
    let t = Transaction::new_signed_with_payer(
        ixs,
        Some(&payer.pubkey()),
        signers,
        svm.latest_blockhash(),
    );
    svm.send_transaction(t)
}

/// Initialize config with two admin keypairs we control, returning the env.
pub fn boot() -> Env {
    let mut svm = setup();
    let payer = funded_keypair(&mut svm, 100_000_000_000);
    let admin1 = funded_keypair(&mut svm, 10_000_000_000);
    let admin2 = funded_keypair(&mut svm, 10_000_000_000);
    let notary = Keypair::new();
    let ix = ix_init_config(
        &payer.pubkey(),
        &notary.pubkey(),
        &[admin1.pubkey(), admin2.pubkey()],
    );
    send(&mut svm, &payer, &[&payer], &[ix]).expect("init_config");
    Env {
        svm,
        payer,
        admin1,
        admin2,
        notary,
    }
}

/// Create an edition and flip it to Open, returning its id. `signers` are the
/// edition's certificate signers (pubkey, name, role).
pub fn create_open_edition(
    env: &mut Env,
    signers: &[(Pubkey, &str, &str)],
    max_supply: u64,
) -> u64 {
    let id = decode_config(&account_data(&env.svm, &config_pda().0)).editions_created;
    let create = ix_create_edition(
        &env.payer.pubkey(),
        id,
        "Test Edition",
        &[7u8; 32],
        max_supply,
        signers,
        &[env.admin1.pubkey()],
    );
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[create],
    )
    .expect("create_edition");
    let open = ix_set_edition_status(id, constants::edition_status::OPEN, &[env.admin1.pubkey()]);
    send(
        &mut env.svm,
        &env.payer,
        &[&env.payer, &env.admin1],
        &[open],
    )
    .expect("open edition");
    id
}

// ── Mollusk bridge (LiteSVM state → Mollusk account list) ───────────────────

/// A system-owned account with `lamports` and no data (payers/signers, or an
/// empty to-be-created PDA when `lamports == 0`).
pub fn sol_account(lamports: u64) -> Account {
    Account {
        lamports,
        owner: SYSTEM_PROGRAM,
        ..Default::default()
    }
}

/// `(key, live account)` pulled from a LiteSVM env for handing to Mollusk.
pub fn live(svm: &LiteSVM, key: &Pubkey) -> (Pubkey, Account) {
    (*key, svm.get_account(key).expect("account exists"))
}

/// The System Program keyed account (required for CreateAccount CPIs in Mollusk).
pub fn sys_program() -> (Pubkey, Account) {
    mollusk_svm::program::keyed_account_for_system_program()
}
