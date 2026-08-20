"use client";

// The ONLY module touching @wallet-standard/* (ESLint-fenced). Subscribes to
// the browser's wallet-standard registry — every installed wallet (Phantom,
// Solflare, Backpack, …) self-registers there, and so does Privy's embedded
// wallet once its user logs in, which is exactly how the fallback appears in
// the same picker.

import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { useSyncExternalStore } from "react";

const api = typeof window === "undefined" ? null : getWallets();
// Stable reference for the SSR/empty case — useSyncExternalStore requires
// getServerSnapshot to return a cached value, or React throws an infinite-loop
// warning and re-renders every commit.
const NO_WALLETS: readonly Wallet[] = [];
let cached: readonly Wallet[] = api ? api.get() : NO_WALLETS;

function subscribe(onChange: () => void): () => void {
  if (!api) return () => {};
  const offs = [
    api.on("register", () => {
      cached = api.get();
      onChange();
    }),
    api.on("unregister", () => {
      cached = api.get();
      onChange();
    }),
  ];
  return () => offs.forEach((off) => off());
}

const getSnapshot = (): readonly Wallet[] => cached;
const getServerSnapshot = (): readonly Wallet[] => NO_WALLETS;

export function useRegistryWallets(): readonly Wallet[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
