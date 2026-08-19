/* ============================================================
   سكربت البناء الموحّد لمشروع Golog على Vercel (الإصدار الجديد - الأكثر استقراراً)
   يقوم بـ:
   1. تثبيت تبعيات workspace إن لم تكن مثبّتة
   2. بناء الواجهة الأمامية (Vite) داخل packages/web
   3. نسخ مخرجات البناء إلى مجلد /public في الجذر (مجلد Vercel الافتراضي)
   4. فحص أنواع TypeScript لـ API Server
   ============================================================ */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "packages", "web");
const WEB_DIST = path.join(WEB_DIR, "dist");
const ROOT_PUBLIC = path.join(ROOT, "public"); // ← مجلد Vercel الافتراضي

function log(msg) {
  console.log("\n[vercel-build] " + msg + "\n");
}

function run(cmd, cwd) {
  log("Running: " + cmd);
  const result = spawnSync(cmd, {
    shell: true,
    cwd: cwd || ROOT,
    stdio: "inherit",
    env: Object.assign({}, process.env, { CI: "true" }),
  });
  if (result.status !== 0) {
    console.error("[vercel-build] FAILED command: " + cmd);
    process.exit(result.status || 1);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  log("Golog unified build script starting...");
  console.log("ROOT = " + ROOT);

  // ------------------------------------------------------------
  // الخطوة 0: التأكد من تثبيت تبعيات الجذر (workspace)
  // ------------------------------------------------------------
  const ROOT_NODE_MODULES = path.join(ROOT, "node_modules");
  if (!fs.existsSync(ROOT_NODE_MODULES)) {
    log("Installing workspace dependencies from root...");
    run("npm install", ROOT);
  } else {
    log("Workspace dependencies already installed");
  }

  // ------------------------------------------------------------
  // الخطوة 1: تثبيت تبعيات الواجهة الأمامية وإنشائها
  // ------------------------------------------------------------
  const WEB_NODE_MODULES = path.join(WEB_DIR, "node_modules");
  if (!fs.existsSync(WEB_NODE_MODULES)) {
    log("Installing frontend dependencies (packages/web)...");
    run("npm install", WEB_DIR);
  }

  log("Building frontend (vite build)...");
  run("npm run build", WEB_DIR);

  if (!fs.existsSync(WEB_DIST)) {
    console.error("[vercel-build] FATAL: frontend dist folder is missing after build!");
    process.exit(1);
  }
  log("Frontend built successfully ✓");

  // ------------------------------------------------------------
  // الخطوة 2: نسخ مخرجات الواجهة إلى مجلد /public في الجذر
  // (مجلد Vercel الافتراضي لخدمة الملفات الثابتة)
  // ------------------------------------------------------------
  log("Cleaning old /public folder at root: " + ROOT_PUBLIC);
  cleanDir(ROOT_PUBLIC);

  log("Copying frontend dist from " + WEB_DIST + " → " + ROOT_PUBLIC);
  copyDir(WEB_DIST, ROOT_PUBLIC);
  log("Frontend copied successfully ✓");

  // ------------------------------------------------------------
  // الخطوة 3: فحص أنواع TypeScript لـ API Server
  // ------------------------------------------------------------
  const API_DIR = path.join(ROOT, "packages", "api-server");
  const API_NODE_MODULES = path.join(API_DIR, "node_modules");
  if (!fs.existsSync(API_NODE_MODULES)) {
    log("Installing API Server dependencies...");
    run("npm install", API_DIR);
  }

  log("Type-checking API Server TypeScript...");
  run("npm run typecheck", API_DIR);
  log("TypeScript checks passed ✓");

  log("\n🎉 Build complete — project is ready for Vercel deployment!\n");
}

main().catch(function (err) {
  console.error("[vercel-build] Build script FATAL error:", err);
  process.exit(1);
});
