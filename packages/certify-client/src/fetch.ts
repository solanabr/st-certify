/**
 * Convenience fetch-and-decode helpers over a kit RPC. The app's `lib/chain`
 * adapter may use these directly, or fetch itself and call the decoders. Each
 * returns `null` when the account does not exist.
 */

import { fetchEncodedAccount, type Address } from "@solana/kit";

import {
  decodeCertificate,
  decodeConfig,
  decodeEdition,
  decodeHashIndex,
  type DecodedCertificate,
  type DecodedConfig,
  type DecodedEdition,
  type DecodedHashIndex,
} from "./accounts";

/** The RPC subset kit's `fetchEncodedAccount` requires (a `getAccountInfo` RPC). */
export type FetchRpc = Parameters<typeof fetchEncodedAccount>[0];

async function fetchDecoded<T>(
  rpc: FetchRpc,
  address: Address,
  decode: (data: Uint8Array) => T,
): Promise<T | null> {
  const account = await fetchEncodedAccount(rpc, address);
  return account.exists ? decode(account.data) : null;
}

export const fetchConfig = (
  rpc: FetchRpc,
  address: Address,
): Promise<DecodedConfig | null> => fetchDecoded(rpc, address, decodeConfig);

export const fetchEdition = (
  rpc: FetchRpc,
  address: Address,
): Promise<DecodedEdition | null> => fetchDecoded(rpc, address, decodeEdition);

export const fetchCertificate = (
  rpc: FetchRpc,
  address: Address,
): Promise<DecodedCertificate | null> =>
  fetchDecoded(rpc, address, decodeCertificate);

export const fetchHashIndex = (
  rpc: FetchRpc,
  address: Address,
): Promise<DecodedHashIndex | null> =>
  fetchDecoded(rpc, address, decodeHashIndex);
