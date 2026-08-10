// Vitest doesn't go through Next.js's bundler, which is what normally makes
// `import "server-only"` a safe no-op on the server side (it resolves via a
// Next-specific "react-server" export condition). Under plain Node/Vite
// resolution, `server-only`'s default export throws unconditionally — see
// node_modules/server-only/index.js. apps/web/vitest.config.ts aliases the
// bare "server-only" specifier to this empty module so files that start
// with `import "server-only"` (render.ts, storage.ts) load fine in tests.
export {};
