// Chaos Radio — Applica le migration SQL al DB senza il motore Prisma
//
// SU STELLAR (Namecheap shared) `prisma migrate deploy` non funziona: il
// binario WASM del query engine non si scarica su quell'hosting (vedi
// deploy/DEPLOY.md). Questo script applica le stesse migration SQL con il
// driver `mariadb`, che è già una dipendenza di produzione e funziona
// (è quello che usa il client Prisma via driver adapter).
//
// Uso:
//   node --env-file=.env --experimental-strip-types scripts/apply-migrations.mjs
//   node --env-file=.env --experimental-strip-types scripts/apply-migrations.mjs --dry-run
//
// Idempotente: le migration già applicate vengono saltate e ogni singola
// istruzione "già presente" (colonna, indice, FK duplicati) viene ignorata,
// così lo script si può rieseguire senza effetti collaterali.
//
// Le migration applicate vengono registrate in `schema_migrations`. Se il DB
// ha già la tabella `_prisma_migrations` di Prisma, anche quella viene letta:
// le migration che Prisma considera applicate non vengono riapplicate.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "mariadb";
import { loadEnv } from "./_shared.mjs";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../prisma/migrations");
const DRY_RUN = process.argv.includes("--dry-run");

/**
 * Codici errno MySQL per "questo oggetto esiste già": l'istruzione va
 * saltata (la migration è stata applicata a metà in un run precedente).
 */
const ALREADY_EXISTS = new Set([
  "ER_DUP_FIELDNAME", // colonna già presente
  "ER_DUP_KEYNAME", // indice già presente
  "ER_FK_DUP_NAME", // FK già presente
  "ER_TABLE_EXISTS_ERROR", // tabella già presente
  "ER_DUP_ENTRY", // riga già presente
]);

/**
 * Split di uno script SQL in singole istruzioni.
 * Toglie i commenti `--` e separa su `;`, ignorando i `;` dentro stringhe.
 * @param {string} sql
 * @returns {string[]}
 */
export function splitStatements(sql) {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  const statements = [];
  let current = "";
  let quote = null;

  for (const ch of withoutComments) {
    if (quote) {
      current += ch;
      if (ch === quote && current[current.length - 2] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());

  return statements;
}

/**
 * Elenco delle migration presenti nella cartella, in ordine.
 * @returns {Array<{name: string, file: string}>}
 */
function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileDirectories: true })
    .filter((d) => fs.existsSync(path.join(MIGRATIONS_DIR, d, "migration.sql")))
    .sort()
    .map((d) => ({ name: d, file: path.join(MIGRATIONS_DIR, d, "migration.sql") }));
}

/**
 * @param {import("mariadb").Connection} conn
 * @returns {Promise<Set<string>>}
 */
async function alreadyApplied(conn) {
  const applied = new Set();

  const tables = await conn.query("SHOW TABLES LIKE 'schema_migrations'");
  if (tables.length > 0) {
    const rows = await conn.query("SELECT name FROM schema_migrations");
    for (const r of rows) applied.add(String(r.name));
  }

  const prismaTables = await conn.query("SHOW TABLES LIKE '_prisma_migrations'");
  if (prismaTables.length > 0) {
    const rows = await conn.query(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    for (const r of rows) applied.add(String(r.migration_name));
  }

  return applied;
}

async function main() {
  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.log("[migrate] nessuna migration trovata");
    return;
  }

  const conn = await createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "chaos_app",
    password: process.env.DB_PASSWORD ?? "devpass",
    database: process.env.DB_NAME ?? "chaos_radio",
    connectTimeout: 15000,
  });

  try {
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(191) NOT NULL,
         applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
         PRIMARY KEY (name)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );

    const applied = await alreadyApplied(conn);
    const pending = migrations.filter((m) => !applied.has(m.name));

    console.log(
      `[migrate] ${migrations.length} migration nel repo, ${applied.size} già applicate, ${pending.length} da applicare`,
    );

    for (const migration of pending) {
      const sql = fs.readFileSync(migration.file, "utf8");
      const statements = splitStatements(sql);

      if (DRY_RUN) {
        console.log(`[migrate] (dry-run) ${migration.name}: ${statements.length} istruzioni`);
        continue;
      }

      console.log(`[migrate] applico ${migration.name}…`);
      for (const statement of statements) {
        try {
          await conn.query(statement);
        } catch (err) {
          if (ALREADY_EXISTS.has(err.code)) {
            console.log(`[migrate]   ↷ già presente, salto: ${statement.slice(0, 60)}…`);
            continue;
          }
          throw err;
        }
      }
      await conn.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [
        migration.name,
      ]);
      console.log(`[migrate] ✓ ${migration.name} applicata`);
    }

    if (DRY_RUN) {
      console.log("[migrate] dry-run: nessuna modifica applicata");
    } else {
      console.log("[migrate] ✓ done");
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("[migrate] FATAL", err);
  process.exitCode = 1;
});
