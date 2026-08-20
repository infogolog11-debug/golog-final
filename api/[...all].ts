/* ============================================================
   🚀 الحل الرسمي الوحيد والنهائي لمشاكل مسارات الـ API على Vercel
   ------------------------------------------------------------
   هذا هو الملف الوحيد والوحيد الذي ستجده في مجلد api الآن:
     اسمه [...all].ts في جذر مجلد api (لا يوجد أي ملفات أخرى!).

   وفق توثيق Vercel الرسمي لملفات catch-all داخل مجلد Functions (api):
   الملف api/[...all].ts وحده يلتقط 100% من الطلبات التي تبدأ بـ
     /api/... بلا أي استثناء — بما في ذلك:
       /api
       /api/health
       /api/auth/google
       /api/auth/google/callback
       /api/users/me/switch-role
       /api/debug/session-test
       /api/debug/db-sync
       /api/trips
       /api/bookings
       ...وكل المسارات الأخرى.

   لا نعتمد على أي قواعد Rewrites خارجية لتحويل المسارات → الصفر
   احتمال لخطأ 404 بسبب تعارضات أو Regex غير مطابقة.
   ============================================================ */

process.env.NODE_ENV = process.env.NODE_ENV || "production";

if (!process.env.VERCEL) {
  try {
    const fs = require("fs");
    const path = require("path");
    const dotenv = require("dotenv");
    const envPath = path.resolve(__dirname, "..", "packages", "api-server", ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch (e) {
    // ignore locally
  }
}

let cachedApp: any = null;

function getExpressApp() {
  if (cachedApp) return cachedApp;
  try {
    const path = require("path") as typeof import("path");
    const bundlePath = path.resolve(__dirname, "..", "_api_bundle", "app.bundle.js");
    const mod = require(bundlePath);
    cachedApp = mod.default || mod;
    return cachedApp;
  } catch (err) {
    console.error("[vercel:api/[...all]] FAILED to load Express app:", err);
    throw err;
  }
}

/*
  دالة مهمة جداً: تعمل على إضافة بادئة /api إلى req.url و req.originalUrl
  في حال كانت مفقودة (حسب نظام Vercel الذي ينزع البادئة أحياناً من req.url
  عندما يكون الملف عبارة عن Catch-all). الدالة Idempotent تماماً: إذا وجدت
  البادئة موجودة أصلاً، لا تضيفها مرة ثانية.
*/
function ensureApiPrefix(req: any) {
  const prefix = "/api";
  if (!req.url.startsWith(prefix + "/") && req.url !== prefix) {
    req.url = prefix + (req.url.startsWith("/") ? req.url : "/" + req.url);
  }
  if (req.originalUrl && !req.originalUrl.startsWith(prefix + "/") && req.originalUrl !== prefix) {
    req.originalUrl = prefix + (req.originalUrl.startsWith("/") ? req.originalUrl : "/" + req.originalUrl);
  }
}

export default async function handler(req: any, res: any) {
  try {
    ensureApiPrefix(req);
    const app = getExpressApp();
    if (!app || typeof app !== "function") {
      return res.status(500).json({
        error: "API failed to boot",
        appType: typeof app,
        tip:
          "تأكد من نجاح مرحلة البناء (Build Logs) وأن مجلد _api_bundle/app.bundle.js " +
          "موجود فعلاً بعد انتهاء npm run vercel-build.",
      });
    }
    return new Promise((resolve) => {
      app(req, res, (err?: any) => {
        if (err) {
          console.error("[vercel:api/[...all]] Express error after route handling:", err);
          if (!res.headersSent) {
            res.status(500).json({
              error: "Internal server error",
              message: err?.message || String(err),
            });
          }
        }
        resolve(undefined);
      });
    });
  } catch (e: any) {
    console.error("[vercel:api/[...all]] FATAL TOP-LEVEL:", e);
    return res.status(500).json({
      error: "API crashed before Express could handle",
      message: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}
