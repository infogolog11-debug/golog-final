/* ============================================================
   المُعالج الوحيد والوحيد لـ 100% من مسارات الـ API على Vercel!
   (باستخدام Rewrite صريح في vercel.json يُجبر كل ما يبدأ بـ /api
   أو /api/* على الدخول إلى هذا الملف — لا نعتمد على File System
   Router الخاص بـ Vercel في المطابقة، لذا ZERO احتمال لخطأ 404
   بسبب تعارضات المجلدات أو المسارات العميقة مثل:
     /api/auth/google
     /api/auth/google/callback
     /api/users/me/switch-role
     /api/health
     /api/debug/db-sync
   كلها ستصل إلى هنا بلا استثناءات.)
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
    console.error("[vercel:api/index] FAILED to load Express app:", err);
    throw err;
  }
}

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
        tip: "تأكد من نجاح مرحلة البناء (vercel-build) وأن مجلد _api_bundle/app.bundle.js موجود بعد Build Logs.",
      });
    }
    return new Promise((resolve) => {
      app(req, res, (err?: any) => {
        if (err) {
          console.error("[vercel:api/index] Express error:", err);
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
    console.error("[vercel:api/index] FATAL:", e);
    return res.status(500).json({
      error: "API crashed",
      message: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
}
