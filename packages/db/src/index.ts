import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

// قاعدة بيانات PostgreSQL مستقلة (Neon / Supabase / أي مزود قياسي)
// لا يوجد أي اعتماد على Replit هنا — فقط DATABASE_URL قياسي.
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Point it to your Neon/Supabase/Postgres instance.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

export * from "./schema/index";
