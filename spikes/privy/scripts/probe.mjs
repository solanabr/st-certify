// M0-spikeB verification driver. Drives the running dev server (http://localhost:5183)
// with a locally-cached Chromium via playwright-core (the shared @playwright/mcp server
// is broken in this environment — it insists on the "chrome" channel and there is no real
// Google Chrome.app installed). Not a test suite; a one-shot rung-by-rung probe that keeps
// going after a failed rung so later diagnostics still get captured.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const APP_URL = "http://localhost:5183/";
const ARTIFACTS = new URL("../artifacts/", import.meta.url).pathname;
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (msg) => console.log(`[console:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => console.log(`[pageerror] ${err.message}`));
page.on("requestfailed", (req) =>
  console.log(`[requestfailed] ${req.method()} ${req.url()} — ${req.failure()?.errorText}`),
);
page.on("response", (res) => {
  if (res.url().includes("privy.io")) {
    console.log(`[response] ${res.status()} ${res.url()}`);
  }
});

async function dumpFrameText() {
  let text = "";
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    try {
      text += `[frame ${f.url()}]\n` + (await f.locator("body").first().innerText({ timeout: 2000 })) + "\n---\n";
    } catch {
      // frame not ready / cross-origin quirk; skip
    }
  }
  return text;
}

console.log(`--- R1: navigate ${APP_URL}`);
await page.goto(APP_URL, { waitUntil: "load" });
await page.waitForSelector("h1");
await page.screenshot({ path: `${ARTIFACTS}r1-loaded.png`, fullPage: true });
console.log("R1 OK: page loaded, screenshot saved to artifacts/r1-loaded.png");

console.log("--- waiting for Privy ready:true (up to 20s) ---");
const readyOk = await page
  .getByText("yes", { exact: true })
  .first()
  .waitFor({ timeout: 20000 })
  .then(() => true)
  .catch(() => false);
console.log(readyOk ? "Privy reported ready:true" : "(warn) Privy did NOT report ready:true within 20s");
await page.screenshot({ path: `${ARTIFACTS}r1b-ready-state.png`, fullPage: true });

console.log("--- R2: open login modal ---");
try {
  const loginBtn = page.getByRole("button", { name: "Log in (email or wallet)" });
  await loginBtn.waitFor({ state: "attached", timeout: 5000 });
  const isDisabled = await loginBtn.isDisabled();
  console.log(`login button disabled=${isDisabled}`);
  await loginBtn.click({ timeout: 20000, force: isDisabled });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${ARTIFACTS}r2-modal.png`, fullPage: true });
  console.log(`frames present: ${page.frames().length}`);
  for (const f of page.frames()) console.log(`  frame url: ${f.url()}`);
  const modalText = await dumpFrameText();
  console.log("--- modal text content (iframe bodies) ---");
  console.log(modalText || "(no iframe text captured — modal may render in main document)");
  if (!modalText) {
    console.log("--- main document text (fallback) ---");
    console.log(await page.locator("body").innerText());
  }
  console.log("R2 screenshot saved to artifacts/r2-modal.png");
} catch (err) {
  console.log(`R2 FAILED: ${err instanceof Error ? err.message : String(err)}`);
  await page.screenshot({ path: `${ARTIFACTS}r2-modal-failed.png`, fullPage: true }).catch(() => {});
}

console.log("--- R3 attempt: test account login ---");
try {
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const testBtn = page.getByRole("button", { name: "Log in with test account" });
  await testBtn.waitFor({ state: "attached", timeout: 5000 });
  const disabled = await testBtn.isDisabled();
  await testBtn.click({ timeout: 20000, force: disabled });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${ARTIFACTS}r3-test-account-attempt.png`, fullPage: true });
  const r3Text = await dumpFrameText();
  console.log("--- R3 modal text after prefill+submit attempt ---");
  console.log(r3Text || "(no iframe text captured)");
} catch (err) {
  console.log(`R3 FAILED: ${err instanceof Error ? err.message : String(err)}`);
  await page.screenshot({ path: `${ARTIFACTS}r3-failed.png`, fullPage: true }).catch(() => {});
}

await browser.close();
console.log("--- probe done ---");
