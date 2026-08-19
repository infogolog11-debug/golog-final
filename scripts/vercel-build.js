/* ============================================================
   سكربت البناء الموحّد لمشروع Golog على Vercel
   يقوم بـ:
   1. تثبيت تبعيات workspace إن لم تكن مثبّتة
   2. بناء الواجهة الأمامية (Vite) داخل packages/web
   3. نسخ مخرجات البناء إلى packages/api-server/public
   4. فحص أنواع TypeScript لـ API Server
   ============================================================ */

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WEB_DIR = path.join(ROOT, "packages", "web");
const WEB_DIST = path.join(WEB_DIR, "dist");
const API_PUBLIC = path.join(ROOT, "packages", "api-server", "public");

function log(msg) {
  console.log(`\n[vercel-build] ${msg}\n`);
}

function run(cmd, cwd) {
  log(`تشغيل: ${cmd}`);
  const result = spawnSync(cmd, {
    shell: true,
    cwd: cwd || ROOT,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (result.status !== 0) {
    console.error(`❌ فشل الأمر: ${cmd}`);
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
  log("بدء سكربت البناء الموحّد لـ Golog");
  console.log(`ROOT = ${ROOT}`);

  // ------------------------------------------------------------
  // الخطوة 0: التأكد من تثبيت تبعيات الجذر (workspace)
  // ------------------------------------------------------------
  const ROOT_NODE_MODULES = path.join(ROOT, "node_modules");
  if (!fs.existsSync(ROOT_NODE_MODULES)) {
    log("تثبيت تبعيات Workspace من الجذر...");
    run("npm install", ROOT);
  } else {
    log("تبعيات Workspace موجودة بالفعل");
  }

  // ------------------------------------------------------------
  // الخطوة 1: تثبيت تبعيات الواجهة الأمامية وإنشائها
  // ------------------------------------------------------------
  const WEB_NODE_MODULES = path.join(WEB_DIR, "node_modules");
  if (!fs.existsSync(WEB_NODE_MODULES)) {
    log("تثبيت تبعيات الواجهة الأمامية (packages/web)...");
    run("npm install", WEB_DIR);
  }

  log("بناء الواجهة الأمامية (Vite build)...");
  run("npm run build", WEB_DIR);

  if (!fs.existsSync(WEB_DIST)) {
    console.error("❌ فشل بناء الواجهة الأمامية — مجلد dist غير موجود!");
    process.exit(1);
  }
  log("تم بناء الواجهة بنجاح ✓");

  // ------------------------------------------------------------
  // الخطوة 2: نسخ مخرجات الواجهة إلى مجلد public في API Server
  // ------------------------------------------------------------
  log(`حذف المجلد القديم: ${API_PUBLIC}`);
  cleanDir(API_PUBLIC);

  log(`نسخ مخرجات الواجهة من ${WEB_DIST} إلى ${API_PUBLIC}`);
  copyDir(WEB_DIST, API_PUBLIC);
  log("تم نسخ الواجهة بنجاح ✓");

  // ------------------------------------------------------------
  // الخطوة 3: فحص أنواع TypeScript لـ API Server
  // ------------------------------------------------------------
  const API_DIR = path.join(ROOT, "packages", "api-server");
  const API_NODE_MODULES = path.join(API_DIR, "node_modules");
  if (!fs.existsSync(API_NODE_MODULES)) {
    log("تثبيت تبعيات API Server...");
    run("npm install", API_DIR);
  }

  log("فحص أنواع TypeScript لـ API Server...");
  run("npm run typecheck", API_DIR);
  log("تم فحص الأنواع بنجاح ✓");

  log("\n🎉 انتهى البناء بنجاح — المشروع جاهز للنشر على Vercel!");
}

main().catch((err) => {
  console.error("❌ فشل سكربت البناء:", err);
  process.exit(1);
});
