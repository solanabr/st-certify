//! Program-wide constants: PDA seeds, account discriminators, threshold policy,
//! bootstrap admin, and the status-byte enumerations. Single source of truth for
//! both handlers (task #11) and tests (task #12).

use pinocchio::Address;

/// PDA seed prefixes. Never change — they are baked into every derived address.
pub mod seeds {
    pub const CONFIG: &[u8] = b"config";
    pub const EDITION: &[u8] = b"edition";
    pub const CERT: &[u8] = b"cert";
    pub const HASH: &[u8] = b"hash";
}

/// Account discriminator (byte 0 of every program-owned account).
pub mod disc {
    /// Uninitialized / virgin account — never a valid loaded state.
    pub const UNINIT: u8 = 0x00;
    pub const CONFIG: u8 = 0x01;
    pub const EDITION: u8 = 0x02;
    pub const CERTIFICATE: u8 = 0x03;
    pub const HASH_INDEX: u8 = 0x04;
    /// Closed-account tombstone — blocks same-tx revival at the [L] gate.
    pub const TOMBSTONE: u8 = 0xFF;
}

/// Edition lifecycle status (`Edition.status`, byte 2). `0` is invalid.
pub mod edition_status {
    pub const PAUSED: u8 = 1;
    pub const OPEN: u8 = 2;
    pub const CLOSED: u8 = 3;
}

/// Certificate lifecycle status (`Certificate.status`, byte 2). `0` is invalid.
/// `PartiallySigned` is *derived* (status == REQUESTED && signed_mask != 0), never stored.
pub mod cert_status {
    pub const REQUESTED: u8 = 1;
    pub const FULLY_SIGNED: u8 = 2;
    pub const CLAIMED: u8 = 3;
    pub const REVOKED: u8 = 4;
}

/// Admin-signer threshold for non-destructive privileged ops
/// (create_edition, set_edition_status, set_max_supply, record_asset, reject admin-path).
pub const T_CREATE: u8 = 1;

/// Admin-signer threshold (pairwise-distinct) for destructive ops
/// (revoke_certificate, set_notary, add_admin, remove_admin).
pub const T_DESTRUCTIVE: u8 = 2;

/// `remove_admin` additionally requires `admin_count - 1 >= MIN_ADMINS_AFTER_REMOVE`.
pub const MIN_ADMINS_AFTER_REMOVE: u8 = 3;

/// Admin registry bounds.
pub const MIN_ADMINS: u8 = 2; // init floor = T_DESTRUCTIVE satisfiability
pub const MAX_ADMINS: u8 = 8;

/// Edition signer-slot bounds.
pub const MIN_SIGNERS: u8 = 2;
pub const MAX_SIGNERS: u8 = 6;

/// Force-included admin at `init_config` (guarantees a recovery key exists).
pub const BOOTSTRAP_ADMIN: Address =
    Address::from_str_const("Eccp5WL2sBcQGzxCPekX2FubvCzqz2RqAFZ6ieGZyMU9");

/// The all-zero address — used as the "empty slot" / "unset" sentinel.
pub const ZERO_ADDRESS: Address = Address::new_from_array([0u8; 32]);
