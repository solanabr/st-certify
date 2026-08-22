This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## UI mock mode

`NEXT_PUBLIC_UI_MOCK=1 npm run dev` renders every screen against fixtures
instead of Privy, Supabase and the RPC, so the UI can be reviewed with no
wallet, no database and no chain. The branch lives at the query-function
boundary (`lib/db/**`, `lib/auth.ts`, `lib/attendance/require-creator.ts`), so
pages and components are untouched by it, and the fixtures in
`lib/mock/fixtures.ts` are deterministic — the same screen renders the same
pixels every day. An amber switcher pins itself to the bottom-left corner and
selects the role by writing a `mock_role` cookie: `anon` (logged out),
`student`, `signer`, `admin` (the default, and the widest UI) or `creator`.
The guard is `NEXT_PUBLIC_UI_MOCK === "1" && NODE_ENV !== "production"`, so a
stray flag can never swap real data for fixtures in a deployed build. Only
reads are mocked: writes still go to the real backends and will fail without
one, which is deliberate — a preview should not pretend a mint succeeded. Every
detail screen is reachable from its list page, and any id, slug or token
starting with `mock-` (`/verify/mock-cert`, `/attend/mock-token`,
`/studio/editions/mock-1`) resolves to a representative fixture; anything else
unrecognized still renders the genuine 404 or dead-link state.

## Device/viewport UI QA

`scripts/ui-qa.mjs` screenshots every key screen at real device viewports
(desktop, widescreen, iPad portrait/landscape, Pixel 7, iPhone 14 Pro) so the
UI can be reviewed across form factors without relying on a browser's manual
window resize (which doesn't emulate real device viewports/DPR/touch).

```bash
# terminal 1
NEXT_PUBLIC_UI_MOCK=1 npm run dev

# terminal 2
npm run ui-qa
```

Screenshots land in `.ui-qa/<viewport>/<route-slug>.png` (gitignored). Each
route is captured once for `mock_role=admin` and once for `mock_role=student`
(the student pass is suffixed `--student.png`). Override the target with
`BASE_URL=http://localhost:3001 npm run ui-qa`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
