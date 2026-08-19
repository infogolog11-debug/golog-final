/* ============================================================
   Vercel Catch-All Route — يلتقط ALL الطلبات تحت /api/*
   ويمرّرها إلى خادم Express الأساسي.

   هذه هي النقطة المفضلة لـ Vercel؛
   ملف api/index.ts وحده لا يلتقط sub-paths من دون هذا الملف.
   ============================================================ */

process.env.NODE_ENV = process.env.NODE_ENV || "production";

// تحميل متغيرات البيئة محلياً فقط
if (!process.env.VERCEL) {
  try {
    const fs = require("fs");
    const path = require("path");
    const dotenv = require("dotenv");
    const envPath = path.resolve(__dirname, "..", "..", "packages", "api-server", ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch (e) {
    // ignore locally
  }
}

let cachedApp: any = null;

async function getExpressApp() {
  if (cachedApp) return cachedApp;
  try {
    const mod = await import("../../packages/api-server/src/app");
    cachedApp = mod.default || mod;
    return cachedApp;
  } catch (err) {
    console.error("[vercel catch-all] FAILED to load Express app:", err);
    throw err;
  }
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getExpressApp();
    if (!app || typeof app !== "function") {
      return res.status(500).json({
        error: "API failed to boot",
        appType: typeof app,
      });
    }
    return new Promise((resolve) => {
      app(req, res, (err?: any) => {
        if (err) {
          console.error("[vercel catch-all] Express error:", err);
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
    console.error("[vercel catch-all] FATAL:", e);
    return res.status(500).json({
      error: "API crashed",
      message: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}
