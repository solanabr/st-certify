// Device/viewport QA harness: screenshots every key screen at real device
// sizes so UI can be reviewed across desktop/widescreen/iPad/Android/iPhone.
//
// Usage:
//   NEXT_PUBLIC_UI_MOCK=1 npm run dev   # in one terminal
//   npm run ui-qa                       # in another
//
// Env:
//   BASE_URL  - defaults to http://localhost:3000
//
// Output:
//   apps/web/.ui-qa/<viewport>/<route-slug>.png             (mock_role=admin)
//   apps/web/.ui-qa/<viewport>/<route-slug>--student.png    (mock_role=student)
//
// A route that errors or times out still gets a screenshot attempt and is
// recorded in the end-of-run summary rather than aborting the whole pass.

import { chromium, devices } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", ".ui-qa");
const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Generous timeout: Next dev compiles routes on demand, so the first hit
// against a given route can take several seconds.
const NAV_TIMEOUT_MS = 30_000;

/**
 * @typedef {{
 *   name: string,
 *   viewport: { width: number, height: number },
 *   deviceScaleFactor?: number,
 *   isMobile?: boolean,
 *   hasTouch?: boolean,
 *   userAgent?: string,
 * }} ViewportConfig
 */

/** @type {ViewportConfig[]} */
const VIEWPORTS = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "widescreen", viewport: { width: 1920, height: 1080 } },
  { name: "ipad-portrait", ...devices["iPad Pro 11"] },
  { name: "ipad-landscape", ...devices["iPad Pro 11 landscape"] },
  { name: "pixel-7", ...devices["Pixel 7"] },
  { name: "iphone-14-pro", ...devices["iPhone 14 Pro"] },
];

const ROUTES = [
  "/",
  "/certificates",
  "/verify",
  "/studio",
  "/studio/editions/mock-1",
  "/sign",
  "/me",
  "/events",
  "/verify/mock-cert",
  "/attend/mock-token",
  "/nft/mock-asset",
];

// mock-mode contract (agent building it concurrently): NEXT_PUBLIC_UI_MOCK=1
// on the server + a mock_role cookie on the request selects the fixture role.
const ROLES = ["admin", "student"];

/**
 * @param {string} route
 * @returns {string}
 */
function slugify(route) {
  if (route === "/") return "home";
  return route.replace(/^\//, "").replace(/\//g, "-");
}

/**
 * @param {import("@playwright/test").BrowserContext} context
 * @param {string} route
 * @param {string} outDir
 * @param {string} suffix
 */
async function shootRoute(context, route, outDir, suffix) {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  const file = path.join(outDir, `${slugify(route)}${suffix}.png`);
  const url = `${BASE_URL}${route}`;

  let navWarning;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    // Let fonts/transitions settle past the networkidle signal.
    await page.waitForTimeout(250);
  } catch (err) {
    navWarning = err instanceof Error ? err.message : String(err);
  }

  try {
    await page.screenshot({ path: file, fullPage: true });
    await page.close();
    return { ok: true, file, navWarning };
  } catch (err) {
    await page.close().catch(() => {});
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error: navWarning ? `${navWarning}; ${error}` : error };
  }
}

async function main() {
  console.log(`ui-qa: base=${BASE_URL}`);
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      const outDir = path.join(OUT_DIR, vp.name);
      await mkdir(outDir, { recursive: true });

      for (const role of ROLES) {
        const suffix = role === "admin" ? "" : `--${role}`;
        const context = await browser.newContext({
          viewport: vp.viewport,
          deviceScaleFactor: vp.deviceScaleFactor,
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          userAgent: vp.userAgent,
        });
        await context.addCookies([{ name: "mock_role", value: role, url: BASE_URL }]);

        try {
          for (const route of ROUTES) {
            const result = await shootRoute(context, route, outDir, suffix);
            results.push({ viewport: vp.name, role, route, ...result });
            if (result.ok) {
              console.log(`  [${result.navWarning ? "warn" : "ok"}] ${vp.name}/${role} ${route}`);
            } else {
              console.log(`  [FAIL] ${vp.name}/${role} ${route}: ${result.error}`);
            }
          }
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  const warned = results.filter((r) => r.ok && r.navWarning);

  console.log("\n--- ui-qa summary ---");
  console.log(
    `total: ${results.length}, ok: ${results.length - failed.length - warned.length}, ` +
      `warn: ${warned.length}, failed: ${failed.length}`,
  );
  if (warned.length > 0) {
    console.log("captured despite a navigation warning:");
    for (const w of warned) {
      console.log(`  - ${w.viewport}/${w.role} ${w.route}: ${w.navWarning}`);
    }
  }
  if (failed.length > 0) {
    console.log("no screenshot captured:");
    for (const f of failed) {
      console.log(`  - ${f.viewport}/${f.role} ${f.route}: ${f.error}`);
    }
  }
  console.log(`\nscreenshots: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("ui-qa: fatal error:", err);
  process.exit(1);
});
