import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  const pool = new Pool({ connectionString: url, ssl: /sslmode=require|supabase\.co/.test(url) ? { rejectUnauthorized: false } : undefined });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations aplicadas.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
