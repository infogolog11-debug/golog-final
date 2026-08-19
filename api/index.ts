/* ============================================================
   نقطة دخول Vercel الرسمية لـ Golog - catch-all
   يتم إعادة توجيه كل طلب /api/* إليها من vercel.json
   ============================================================ */

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// تحميل متغيرات البيئة محلياً فقط (على Vercel تكون جاهزة مسبقاً)
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
    console.error("[vercel api] FAILED to load Express app:", err);
    throw err;
  }
}

export default async function (req: any, res: any) {
  try {
    const app = getExpressApp();
    if (!app || typeof app !== "function") {
      return res.status(500).json({
        error: "API failed to boot",
        appType: typeof app,
      });
    }
    return new Promise((resolve, reject) => {
      app(req, res, (err?: any) => {
        if (err) {
          console.error("[vercel api] Express error:", err);
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
    console.error("[vercel api] FATAL:", e);
    return res.status(500).json({
      error: "API crashed",
      message: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}
