import crypto from "crypto";

// ============================================================
// إدارة مركزية لجميع متغيرات البيئة في مشروع Golog
// يجمع هذا الملف جميع المتغيرات المطلوبة مع قيم افتراضية
// آمنة ويفحص المتغيرات الإلزامية عند أول استيراد.
// ============================================================

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.warn(
      `[env] ⚠️  المتغير ${name} غير مُعرَّف! قد لا تعمل بعض الوظائف بشكل صحيح على Vercel، تحقق من إعدادات Environment Variables في لوحة التحكم.`
    );
    return "";
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === "true" || v === "1" || v === "yes";
}

// ============================================================
// 1. روابط التطبيق العامة
// ============================================================
// Vercel يعيّن VERCEL_URL تلقائياً إلى النطاق المؤقت للمشروع
// مثل: golog-final-delta.vercel.app — استخدمه كقيمة افتراضية
// إن لم يكن PUBLIC_URL معرفاً يدوياً.
const VERCEL_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";

export const PUBLIC_URL = (() => {
  const explicit = process.env.PUBLIC_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (VERCEL_URL) return VERCEL_URL;
  return "http://localhost:8080";
})();

// أصول الواجهة المسموح لها بالوصول عبر CORS مع الكوكي
export const WEB_ORIGINS = (() => {
  const explicit = process.env.WEB_ORIGIN;
  if (explicit) {
    return explicit
      .split(",")
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean);
  }
  const origins: string[] = [];
  if (VERCEL_URL) origins.push(VERCEL_URL);
  origins.push("http://localhost:5173", "http://localhost:8080");
  return origins;
})();

export const COOKIE_SAME_SITE: "lax" | "none" | "strict" =
  (process.env.COOKIE_SAME_SITE as "lax" | "none" | "strict") ||
  (PUBLIC_URL.startsWith("http://localhost") ? "lax" : "lax");

// ============================================================
// 2. قاعدة البيانات
// ============================================================
export const DATABASE_URL = required("DATABASE_URL");

// ============================================================
// 3. أمان الجلسات — إن لم يُعرَّف، نولّد قيمة عشوائية مؤقتة
//    (ملاحظة: سيؤدي ذلك إلى تسجيل خروج جميع المستخدمين
//    مع كل إعادة تشغيل على Vercel، لذا يُفضّل ضبط SESSION_SECRET)
// ============================================================
export const SESSION_SECRET = (() => {
  const v = process.env.SESSION_SECRET;
  if (v) return v;
  console.warn(
    "[env] ⚠️  SESSION_SECRET غير معرف! سيتم توليد قيمة مؤقتة — سيُجبر كل مستخدم على تسجيل الدخول مرة أخرى مع كل إعادة تشغيل."
  );
  return crypto.randomBytes(32).toString("hex");
})();

// ============================================================
// 4. Google OAuth 2.0
// ============================================================
export const GOOGLE_CLIENT_ID = optional("GOOGLE_CLIENT_ID");
export const GOOGLE_CLIENT_SECRET = optional("GOOGLE_CLIENT_SECRET");
export const GOOGLE_CALLBACK_URL = `${PUBLIC_URL}/api/auth/google/callback`;

// ============================================================
// 5. بوت تيليجرام
// ============================================================
export const TELEGRAM_BOT_TOKEN = optional("TELEGRAM_BOT_TOKEN");
export const TELEGRAM_BOT_USERNAME = optional("TELEGRAM_BOT_USERNAME", "GologApp_bot");

// ============================================================
// 6. الأدمن التلقائي (يفصل بين العناوين بفاصلة)
// ============================================================
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// ============================================================
// 7. Supabase Storage (S3-compatible)
// ============================================================
export const SUPABASE_PROJECT_REF = optional("SUPABASE_PROJECT_REF");
export const SUPABASE_S3_ACCESS_KEY_ID = optional("SUPABASE_S3_ACCESS_KEY_ID");
export const SUPABASE_S3_SECRET_ACCESS_KEY = optional("SUPABASE_S3_SECRET_ACCESS_KEY");
export const SUPABASE_S3_REGION = optional("SUPABASE_S3_REGION", "us-east-1");
export const SUPABASE_STORAGE_BUCKET = optional("SUPABASE_STORAGE_BUCKET");

// ============================================================
// 8. Twilio SMS
// ============================================================
export const TWILIO_ACCOUNT_SID = optional("TWILIO_ACCOUNT_SID");
export const TWILIO_AUTH_TOKEN = optional("TWILIO_AUTH_TOKEN");
export const TWILIO_FROM_NUMBER = optional("TWILIO_FROM_NUMBER");

// ============================================================
// 9. سجلات السيرفر
// ============================================================
export const LOG_LEVEL = optional("LOG_LEVEL", "info");
export const NODE_ENV = optional("NODE_ENV", "development");
export const IS_PRODUCTION = NODE_ENV === "production";
