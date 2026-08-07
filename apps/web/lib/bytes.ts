/**
 * Plain byte<->string helpers with zero SDK imports — safe from any file
 * (hooks included, which are fenced off from @solana/kit). Loop-based rather
 * than spread-based so there's no call-stack risk at any size, even though
 * transaction wire bytes here are always well under Solana's 1232-byte limit.
 */

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
