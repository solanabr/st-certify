/**
 * [att-8] One-shot remediation: remove `render_spec.values.name_salt` from
 * already-published certificate metadata JSONs in the `metadata` bucket.
 *
 * Newly claimed certificates no longer publish the salt (see
 * apps/web/lib/render/metadata.ts) — an archived salt+name pair would
 * cryptographically bind the student to the on-chain commitment forever,
 * defeating post-erasure unlinkability. This script rewrites what the old
 * builder already published. Objects are content-addressed by the artifact
 * PNG's sha256 (not the JSON's own hash), so the cleaned JSON re-uploads to
 * the same path/URL with upsert — asset `uri`s keep resolving.
 *
 * Copies fetched by third parties before the scrub (wallet indexers, CDN
 * edges within their cache TTL) are out of reach; this stops every future
 * reader.
 *
 * Usage:
 *   npx tsx scripts/admin/scrub-metadata-salt.ts            # dry run (default)
 *   npx tsx scripts/admin/scrub-metadata-salt.ts --execute  # rewrite objects
 *
 * Exit codes: 0 nothing to scrub / scrub completed clean, 1 salted JSONs
 * found (dry run) or some rewrites failed, 2 couldn't run at all.
 */

import {
  EXIT,
  buildSupabaseAdmin,
  hasFlag,
  loadRootEnv,
  printHelpAndExit,
  printTable,
  safeSupabase,
} from "./_shared.js";

const HELP = `
scrub-metadata-salt — remove name_salt from published certificate metadata JSONs.

Usage:
  npx tsx scripts/admin/scrub-metadata-salt.ts [options]

Options:
  --execute   Rewrite the salted objects in place (default: dry run, report only)
  -h, --help  This help
`;

interface CertRow {
  address: string;
  metadata_url: string;
}

interface RenderSpecValues {
  name_salt?: unknown;
  [key: string]: unknown;
}

function metadataPathFromUrl(url: string): string | null {
  const marker = "/object/public/metadata/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (hasFlag(argv, "-h", "--help")) printHelpAndExit(HELP);
  const execute = hasFlag(argv, "--execute");

  loadRootEnv();
  const { admin, missingEnv } = buildSupabaseAdmin();
  if (!admin) {
    console.error(`Missing env: ${missingEnv.join(", ")}`);
    return EXIT.ERROR;
  }

  const { data: certs, error } = await safeSupabase<CertRow[]>(() =>
    admin
      .from("certificates")
      .select("address, metadata_url")
      .not("metadata_url", "is", null),
  );
  if (error) {
    console.error(`certificates query failed: ${error.message}`);
    return EXIT.ERROR;
  }

  const rows: string[][] = [["cert", "path", "state"]];
  let salted = 0;
  let rewritten = 0;
  let failed = 0;

  for (const cert of certs ?? []) {
    const path = metadataPathFromUrl(cert.metadata_url);
    if (!path) {
      rows.push([cert.address, cert.metadata_url, "UNRECOGNIZED URL"]);
      failed++;
      continue;
    }

    let json: {
      render_spec?: { values?: RenderSpecValues };
      [key: string]: unknown;
    };
    try {
      const res = await fetch(cert.metadata_url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = (await res.json()) as typeof json;
    } catch (err) {
      rows.push([
        cert.address,
        path,
        `FETCH FAILED: ${err instanceof Error ? err.message : String(err)}`,
      ]);
      failed++;
      continue;
    }

    const values = json.render_spec?.values;
    if (!values || !("name_salt" in values)) {
      rows.push([cert.address, path, "clean"]);
      continue;
    }

    salted++;
    if (!execute) {
      rows.push([cert.address, path, "SALTED (dry run — would rewrite)"]);
      continue;
    }

    delete values.name_salt;
    const { error: uploadError } = await admin.storage
      .from("metadata")
      .upload(path, Buffer.from(JSON.stringify(json, null, 2), "utf8"), {
        contentType: "application/json",
        upsert: true,
      });
    if (uploadError) {
      rows.push([cert.address, path, `REWRITE FAILED: ${uploadError.message}`]);
      failed++;
      continue;
    }
    rewritten++;
    rows.push([cert.address, path, "scrubbed"]);
  }

  printTable(rows);
  console.log(
    `\n${(certs ?? []).length} published JSON(s): ${salted} salted, ${rewritten} rewritten, ${failed} failed.` +
      (execute ? "" : " Dry run — pass --execute to rewrite."),
  );

  if (failed > 0) return EXIT.FINDINGS;
  if (!execute && salted > 0) return EXIT.FINDINGS;
  return EXIT.OK;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(EXIT.ERROR);
  },
);
