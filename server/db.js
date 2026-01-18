// db.js
import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Render Postgres braucht i.d.R. SSL
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Optional: schneller Healthcheck
export async function dbPing() {
  const r = await pool.query("select 1 as ok");
  return r.rows[0].ok === 1;
}
