/* ============================================================
   Vercel Catch-All Route (ROOT LEVEL — الأكثر توافقاً على الإطلاق!)
   هذا الملف وحده يكفي لالتقاط كل مسارات /api/* تلقائياً بدون الحاجة
   إلى أي rewrites مخصّصة في vercel.json.
   ============================================================ */

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// تحميل متغيرات البيئة محلياً فقط
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

let cachedApp = null;
async function getExpressApp() {
  if (cachedApp) return cachedApp;
  try {
    const mod = await import("../packages/api-server/src/app");
    cachedApp = mod.default || mod;
    return cachedApp;
  } catch (err) {
    console.error("[vercel catch-all] FAILED to load Express app:", err);
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const app = await getExpressApp();
    if (!app || typeof app !== "function") {
      return res.status(500).json({
        error: "API failed to boot",
        appType: typeof app,
      });
    }
    return new Promise((resolve) => {
      app(req, res, (err) => {
        if (err) {
          console.error("[vercel catch-all] Express error:", err);
          if (!res.headersSent) {
            res.status(500).json({
              error: "Internal server error",
              message: err && err.message ? err.message : String(err),
            });
          }
        }
        resolve(undefined);
      });
    });
  } catch (e) {
    console.error("[vercel catch-all] FATAL:", e);
    const message = e && e.message ? e.message : String(e);
    return res.status(500).json({
      error: "API crashed",
      message,
      stack: process.env.NODE_ENV === "production" ? undefined : (e && e.stack ? e.stack : undefined),
    });
  }
}
