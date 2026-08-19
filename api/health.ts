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

let cachedApp = null;
async function getExpressApp() {
  if (cachedApp) return cachedApp;
  try {
    const mod = await import("../_api_bundle/app.bundle.js");
    cachedApp = mod.default || mod;
    return cachedApp;
  } catch (err) {
    console.error("[vercel:api/health] FAILED to load Express app:", err);
    throw err;
  }
}

export default async function handler(req, res) {
  try {
    const app = await getExpressApp();
    if (!app || typeof app !== "function") {
      return res.status(500).json({ error: "API failed to boot", appType: typeof app });
    }
    return new Promise((resolve) => {
      app(req, res, (err) => {
        if (err) {
          console.error("[vercel:api/health] Express error:", err);
          if (!res.headersSent) {
            res.status(500).json({ error: "Internal server error", message: err && err.message ? err.message : String(err) });
          }
        }
        resolve(undefined);
      });
    });
  } catch (e) {
    const message = e && e.message ? e.message : String(e);
    return res.status(500).json({ error: "API crashed", message });
  }
}
