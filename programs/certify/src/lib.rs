#![no_std]
//! Superteam Certify — on-chain certificate registry.
//!
//! Pinocchio 0.11, zero-`unsafe`, zero-heap (`no_allocator!`). Four accounts
//! (Config / Edition / Certificate / HashIndex) and 13 instructions with a
//! native 1-of-N / 2-of-N-distinct admin multisig. All state is flat
//! little-endian byte layouts accessed through explicit-offset views.

pub mod constants;
pub mod error;
pub mod load;
pub mod state;
pub mod threshold;

// Task #11 (m1a-program-2): handlers + dispatch. Module wiring lives here; the
// files' contents are owned by #11.
pub mod instructions;
pub mod processor;

use pinocchio::Address;

/// On-chain program id. Keypair: `programs/certify/certify-keypair.json` (gitignored).
pub const ID: Address = Address::from_str_const("5Wx1mNKSgtu1pnwHgLe5duYK9xcFhEhsd1zoeJi9EiUZ");

/// BPF entrypoint. Gated so host builds (tests/clippy) link the crate as a plain
/// rlib without the runtime shims. Build the `.so`:
/// `cargo build-sbf --features bpf-entrypoint`.
#[cfg(feature = "bpf-entrypoint")]
mod entrypoint {
    #![allow(dead_code)] // `no_allocator!` emits helper fns we don't call.
    use pinocchio::{account::AccountView, Address, ProgramResult};

    pinocchio::program_entrypoint!(process_instruction);
    pinocchio::no_allocator!();
    pinocchio::nostd_panic_handler!();

    #[inline(always)]
    pub fn process_instruction(
        program_id: &Address,
        accounts: &mut [AccountView],
        data: &[u8],
    ) -> ProgramResult {
        crate::processor::process(program_id, accounts, data)
    }
}
