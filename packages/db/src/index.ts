import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index";

// قاعدة بيانات PostgreSQL مستقلة (Neon / Supabase / أي مزود قياسي)
// لا يتم فحص DATABASE_URL بقوة في وقت التحميل (import-time) حتى لا
// ينهار الواجهة أو وظائف Vercel أثناء النشر أو قبل إعداد المتغيرات.
// بدلاً من ذلك، سيظهر خطأ واضح من مكتبة pg عند أول استعلام فعلي
// إذا كان DATABASE_URL مفقوداً أو غير صحيح.
const DATABASE_URL = process.env.DATABASE_URL || "";

// معظم مزودي السحابة (Supabase / Neon / Railway) يتطلّبون SSL مع تعطيل
// فحص شهادة self-signed. السماح بتجاوز هذا عبر متغير اختياري DB_DISABLE_SSL.
const isLocal =
  DATABASE_URL.includes("localhost") ||
  DATABASE_URL.includes("127.0.0.1") ||
  Boolean(process.env.DB_DISABLE_SSL);

export const pool = new Pool({
  connectionString: DATABASE_URL || undefined,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: process.env.NODE_ENV === "production" ? 12 : 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool, { schema });

export * from "./schema/index";
