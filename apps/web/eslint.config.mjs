import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Import fences: @solana/kit + @certify/client may only be imported under
// lib/chain/**, and @supabase/supabase-js only under lib/db/** — keeps chain
// and database access consolidated behind those two modules. Default-deny at
// the root, then relax per-directory in the scoped override blocks below.
const RESTRICTED_KIT = {
  name: "@solana/kit",
  message: "Import @solana/kit only under lib/chain/**.",
};
const RESTRICTED_CLIENT = {
  name: "@certify/client",
  message: "Import @certify/client only under lib/chain/**.",
};
const RESTRICTED_SUPABASE = {
  name: "@supabase/supabase-js",
  message: "Import @supabase/supabase-js only under lib/db/**.",
};
const RESTRICTED_BUBBLEGUM = {
  name: "@metaplex-foundation/mpl-bubblegum",
  message: "Import mpl-bubblegum only under lib/chain/**.",
};
const RESTRICTED_ACCOUNT_COMPRESSION = {
  name: "@metaplex-foundation/mpl-account-compression",
  message: "Import mpl-account-compression only under lib/chain/**.",
};
const RESTRICTED_MPL_CORE = {
  name: "@metaplex-foundation/mpl-core",
  message: "Import mpl-core only under lib/chain/**.",
};
const RESTRICTED_UMI = {
  group: ["@metaplex-foundation/umi", "@metaplex-foundation/umi-*"],
  message: "Import @metaplex-foundation/umi* only under lib/chain/**.",
};
const RESTRICTED_SOLANA_PROGRAM = {
  group: ["@solana-program/*"],
  message: "Import @solana-program/* only under lib/chain/**.",
};
const RESTRICTED_WALLET_STANDARD = {
  group: ["@wallet-standard/*"],
  message: "Import @wallet-standard/* only under lib/wallet/**.",
};

// The chain SDKs, as one list — every non-lib/chain scope denies all of them.
const RESTRICTED_CHAIN_PATHS = [
  RESTRICTED_KIT,
  RESTRICTED_CLIENT,
  RESTRICTED_BUBBLEGUM,
  RESTRICTED_ACCOUNT_COMPRESSION,
  RESTRICTED_MPL_CORE,
];
const RESTRICTED_CHAIN_PATTERNS = [RESTRICTED_UMI, RESTRICTED_SOLANA_PROGRAM];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_CHAIN_PATHS, RESTRICTED_SUPABASE],
          patterns: [...RESTRICTED_CHAIN_PATTERNS, RESTRICTED_WALLET_STANDARD],
        },
      ],
    },
  },
  {
    files: ["lib/chain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [RESTRICTED_SUPABASE], patterns: [RESTRICTED_WALLET_STANDARD] },
      ],
    },
  },
  {
    files: ["lib/db/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: RESTRICTED_CHAIN_PATHS,
          patterns: [...RESTRICTED_CHAIN_PATTERNS, RESTRICTED_WALLET_STANDARD],
        },
      ],
    },
  },
  {
    files: ["lib/wallet/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...RESTRICTED_CHAIN_PATHS, RESTRICTED_SUPABASE],
          patterns: RESTRICTED_CHAIN_PATTERNS,
        },
      ],
    },
  },
];

export default eslintConfig;
