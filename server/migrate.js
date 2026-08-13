// migrate.js
// Führt alle SQL-Dateien aus ./migrations aus, die noch nicht angewendet wurden.
// 001_init.sql wird bei bereits bestehender DB automatisch als "schon angewendet"
// markiert (Baseline), damit nichts doppelt läuft.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export async function runMigrations() {
  await pool.query(`
    create table if not exists schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await pool.query("select filename from schema_migrations")).rows.map((r) => r.filename)
  );

  // Baseline: existiert "games" bereits, gilt 001_init als angewendet.
  if (!applied.has("001_init.sql")) {
    const r = await pool.query("select to_regclass('public.games') as t");
    if (r.rows[0]?.t) {
      await pool.query(
        "insert into schema_migrations(filename) values ($1) on conflict do nothing",
        ["001_init.sql"]
      );
      applied.add("001_init.sql");
    }
  }

  let files = [];
  try {
    files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return;
  }

  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations(filename) values ($1) on conflict do nothing",
        [f]
      );
      await client.query("commit");
      console.log("Migration angewendet:", f);
    } catch (e) {
      await client.query("rollback");
      console.error("Migration fehlgeschlagen:", f, e.message);
      throw e;
    } finally {
      client.release();
    }
  }
}
