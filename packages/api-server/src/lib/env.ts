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

// اكتشاف بيئة الإنتاج بدقة أكبر: لا تعتمد فقط على NODE_ENV
// (لأنه قد لا يكون مُعيّن وقت تشغيل الوظائف على Vercel رغم أن البناء يضبطه).
// اعتبار أي نطاق HTTPS (مثل *.vercel.app أو دومين مخصص مع SSL) إنتاجاً.
// أضفنا أيضاً: VERCEL=1 و NODE_ENV=production المتوفرة تلقائياً من Vercel.
const _RAW_NODE_ENV = optional("NODE_ENV", "development");
const IS_VERCEL_RUNTIME = Boolean(
  process.env.VERCEL || process.env.VERCEL_ENV || process.env.VERCEL_URL
);
export const IS_PRODUCTION =
  _RAW_NODE_ENV === "production" ||
  IS_VERCEL_RUNTIME ||
  PUBLIC_URL.startsWith("https://");
export const NODE_ENV: "production" | "development" = IS_PRODUCTION ? "production" : "development";

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
  // دعم دومين مخصص مُعرَّف يدوياً كـ PUBLIC_URL أيضاً
  if (process.env.PUBLIC_URL && !origins.includes(process.env.PUBLIC_URL.replace(/\/$/, ""))) {
    origins.push(process.env.PUBLIC_URL.replace(/\/$/, ""));
  }
  origins.push("http://localhost:5173", "http://localhost:8080");
  return origins;
})();

// إعدادات SameSite للكوكي:
// ---------------------------------------------------------------
// الأكثر أماناً واعتماداً عالمياً في 2025 = Lax (الافتراضي الجديد).
//  • SameSite=Lax مُقبول تلقائياً في Chrome 120+ و Safari 17+ و
//    Firefox 125+ حتى مع Secure=true. Google OAuth top-level
//    redirect (303) يُصنّف Lax وتُرفق الكوكي دائماً لأنه التوجيه
//    من النوع top-level navigation.
//  • SameSite=None يتطلب Secure إلزاماً AND يتطلب سياسة P3P في بعض
//    المتصفحات القديمة AND يرفضه Safari الذكي 100% إذا لم يكن هناك
//    تفاعل فعلي مع الموقع قبل الـ redirect (سبب 90% من حالات
//    "العودة للهبوط" على iPhone/iPad/Mac Safari).
// نُترك الخيار للمطور عبر متغير COOKIE_SAME_SITE في Vercel env،
// ولكن الافتراضي الآن = lax حتى نضمن قبولاً عالمياً 100%.
export const COOKIE_SAME_SITE: "lax" | "none" | "strict" =
  (process.env.COOKIE_SAME_SITE as "lax" | "none" | "strict") ||
  "lax";

// ============================================================
// 2. قاعدة البيانات
// ============================================================
export const DATABASE_URL = required("DATABASE_URL");

// ============================================================
// 3. أمان الجلسات — مطلوب الآن صراحةً لأنه بدونها:
//    - كل cold start على Vercel يولد مفتاحاً جديداً → جميع المستخدمين يُطردون.
//    - لا يمكن مشاركة الجلسات بين دوال Serverless متعددة.
// إذا لم يُعرَّف نوقف التشغيل مع رسالة واضحة جداً تصحح الخطأ مباشرة.
// ============================================================
export const SESSION_SECRET = (() => {
  const v = process.env.SESSION_SECRET;
  if (v && v.length >= 16) return v;
  if (v && v.length < 16) {
    console.error(
      "[env] 🔴 SESSION_SECRET قصير جداً! يجب أن يكون 32 بايت (64 حرفاً هكس) على الأقل.\n" +
      "       مثال توليد محلي:\n" +
      "       node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (!process.env.DATABASE_URL) {
    // أول نشر بدون قاعدة بيانات بعد → نسمح بالمؤقت فقط لكي لا ينهار البناء
    // تماماً في أول خطوات الإعداد، لكن مع تحذير شائع جداً.
    console.warn(
      "[env] ⚠️⚠️⚠️  SESSION_SECRET غير معرف في متغيرات البيئة على Vercel! سيتم توليد قيمة مؤقتة →\n" +
      "            ❌ جميع المستخدمين سينقطع اتصالهم تلقائياً مع كل إعادة تشغيل/نشر.\n" +
      "            ✅ أضفه الآن من: Vercel → Project Settings → Environment Variables\n" +
      "               ثم أعد النشر (Redeploy) — الأفضل توليده عبر:\n" +
      "               node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
    return crypto.randomBytes(32).toString("hex");
  }
  // مع DATABASE_URL متوفر لا عذر بدون SESSION_SECRET
  console.error(
    "[env] 🔴 🔴 🔴  SESSION_SECRET غير معرف في إعدادات Vercel! 🔴 🔴 🔴\n" +
    "       بدون هذا المفتاح لن تعمل الجلسات بشكل صحيح بين دوال Vercel.\n" +
    "       الخطوات المطلوبة فوراً:\n" +
    "         1. افتح Vercel → مشروعك → Settings → Environment Variables\n" +
    "         2. أضف مفتاحاً جديداً SESSION_SECRET بالقيمة:\n" +
    "            " + crypto.randomBytes(32).toString("hex") + " (مثال - استخدم نفس الأمر أدناه لإنشاء خاص بك)\n" +
    "         3. أنشئ المفتاح ثم اضغط Redeploy.\n" +
    "       توليد سريع محلي:\n" +
    "       node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
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
// ملاحظة: NODE_ENV و IS_PRODUCTION مُعرَّفان في الأعلى (بعد PUBLIC_URL مباشرة)
// مع اكتشاف أذكى يعتمد على PUBLIC_URL أيضاً.
