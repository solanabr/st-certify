//! Native admin multisig: count how many *pairwise-distinct* admins signed.
//!
//! Scans the instruction's full account slice for accounts that are BOTH
//! `is_signer()` AND registered admins, de-duplicated by address (the same admin
//! passed as two metas counts once — a named bug class with a dedicated test).
//! `is_signer` flags are runtime-set and unforgeable.

use {
    crate::{
        constants::{MAX_ADMINS, ZERO_ADDRESS},
        state::config::{Config, ConfigMut},
    },
    pinocchio::{account::AccountView, Address},
};

/// Read side of the admin registry — implemented by both config views so the
/// counter works whether the caller holds a read or read/write borrow.
pub trait AdminRegistry {
    fn is_admin(&self, a: &Address) -> bool;
}

impl AdminRegistry for Config<'_> {
    #[inline(always)]
    fn is_admin(&self, a: &Address) -> bool {
        Config::is_admin(self, a)
    }
}

impl AdminRegistry for ConfigMut<'_> {
    #[inline(always)]
    fn is_admin(&self, a: &Address) -> bool {
        ConfigMut::is_admin(self, a)
    }
}

/// Number of distinct registered admins that signed this instruction.
pub fn count_unique_admin_signers<T: AdminRegistry>(cfg: &T, accounts: &[AccountView]) -> u8 {
    let mut seen: [Address; MAX_ADMINS as usize] = [ZERO_ADDRESS; MAX_ADMINS as usize];
    let mut seen_len = 0usize;
    let mut count: u8 = 0;

    for acc in accounts {
        if !acc.is_signer() {
            continue;
        }
        let key = acc.address();
        if !cfg.is_admin(key) {
            continue;
        }
        // De-dup: same admin passed as multiple metas counts once.
        let mut already = false;
        for slot in seen.iter().take(seen_len) {
            if slot == key {
                already = true;
                break;
            }
        }
        if already {
            continue;
        }
        seen[seen_len] = *key;
        seen_len += 1;
        count += 1;
    }
    count
}
