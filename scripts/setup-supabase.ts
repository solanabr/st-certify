import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

try {
  process.loadEnvFile();
} catch {
  // No .env file found — assume the environment is already configured.
}

const MIGRATIONS_DIR = join(
  import.meta.dirname,
  "..",
  "supabase",
  "migrations",
);
const BUCKETS = ["templates", "certs", "metadata", "attendance"] as const;

async function applyMigrations(): Promise<void> {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log(
      "SUPABASE_DB_URL não definido — pulando aplicação de migrations.\n" +
        "  Próximo passo: defina SUPABASE_DB_URL no .env (connection string Postgres do projeto Supabase)\n" +
        "  e rode `pnpm setup:supabase` novamente, ou aplique supabase/migrations/*.sql manualmente pelo SQL editor do Supabase.",
    );
    return;
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const client = new Client({ connectionString: dbUrl });
  // Surface RAISE NOTICE output: 0003_hardening.sql degrades to a NOTICE (naming
  // a reconcile query) when a unique index or CHECK can't be installed against
  // existing rows, instead of aborting the batch. Without this handler those are
  // silent and the operator never learns a constraint landed only partially.
  client.on("notice", (msg) => console.log(`  NOTICE: ${msg.message ?? msg}`));
  await client.connect();

  try {
    for (const file of files) {
      console.log(`Aplicando migration: ${file}`);
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query(sql);
    }
    console.log(`${files.length} migration(s) aplicada(s) com sucesso.`);
  } finally {
    await client.end();
  }
}

async function setupBuckets(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.log(
      "NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY não definidos — pulando criação de buckets.\n" +
        "  Próximo passo: defina essas variáveis no .env e rode `pnpm setup:supabase` novamente.",
    );
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: existing, error: listError } =
    await supabase.storage.listBuckets();
  if (listError) {
    console.error(`Falha ao listar buckets: ${listError.message}`);
    return;
  }

  const existingNames = new Set((existing ?? []).map((bucket) => bucket.name));

  for (const name of BUCKETS) {
    if (existingNames.has(name)) {
      console.log(`Bucket "${name}" já existe — ok.`);
      continue;
    }

    const { error } = await supabase.storage.createBucket(name, {
      public: true,
    });
    if (error) {
      console.error(`Falha ao criar bucket "${name}": ${error.message}`);
      continue;
    }
    console.log(`Bucket "${name}" criado.`);
  }
}

async function main(): Promise<void> {
  await applyMigrations();
  await setupBuckets();
}

main().catch((error: unknown) => {
  console.error("setup-supabase falhou:", error);
  process.exitCode = 1;
});
