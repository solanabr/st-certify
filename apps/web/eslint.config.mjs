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
const RESTRICTED_WALLET_STANDARD = {
  group: ["@wallet-standard/*"],
  message: "Import @wallet-standard/* only under lib/wallet/**.",
};

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
          paths: [
            RESTRICTED_KIT,
            RESTRICTED_CLIENT,
            RESTRICTED_SUPABASE,
            RESTRICTED_BUBBLEGUM,
            RESTRICTED_ACCOUNT_COMPRESSION,
          ],
          patterns: [RESTRICTED_WALLET_STANDARD],
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
          paths: [RESTRICTED_KIT, RESTRICTED_CLIENT, RESTRICTED_BUBBLEGUM, RESTRICTED_ACCOUNT_COMPRESSION],
          patterns: [RESTRICTED_WALLET_STANDARD],
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
          paths: [
            RESTRICTED_KIT,
            RESTRICTED_CLIENT,
            RESTRICTED_SUPABASE,
            RESTRICTED_BUBBLEGUM,
            RESTRICTED_ACCOUNT_COMPRESSION,
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
