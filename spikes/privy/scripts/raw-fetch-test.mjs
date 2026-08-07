import { chromium } from "playwright-core";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (m) => console.log(`[console] ${m.text()}`));
await page.goto("about:blank");

const hosts = [
  "https://api.devnet.solana.com", // known-good via curl, POST-only JSON-RPC but GET should at least connect
  "https://docs.privy.io", // known-good via curl
  "https://auth.privy.io/api/v1/apps/cmsifiqnq008t0cjryxeg93j5",
];

for (const url of hosts) {
  const start = Date.now();
  const result = await page.evaluate(async (u) => {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort("client-timeout-8s"), 8000);
      const res = await fetch(u, { signal: controller.signal });
      clearTimeout(t);
      return { ok: true, status: res.status };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }, url);
  console.log(`${url} -> ${JSON.stringify(result)} (${Date.now() - start}ms)`);
}

await browser.close();
