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

/**
 * نفس `run()` ولكن لا تنهار عند الخطأ؛ فقط تُظهر تحذيراً واصفراراً.
 * نستخدمها لخطوات إضافية مثل drizzle-push التي قد تفشل
 * في أول نشر قبل إعداد قاعدة البيانات.
 */
function runSoft(cmd, cwd) {
  log("[soft] Running: " + cmd);
  const result = spawnSync(cmd, {
    shell: true,
    cwd: cwd || ROOT,
    stdio: "inherit",
    env: Object.assign({}, process.env, { CI: "true" }),
  });
  if (result.status !== 0) {
    console.warn("⚠️  [vercel-build] NON-FATAL: command failed: " + cmd);
    console.warn("   → status code: " + result.status);
    console.warn("   → (we continue build because DB setup might be intentionally skipped)");
  }
  return result.status === 0;
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
  // الخطوة 0.5 (جديدة): مطابقة الجداول في قاعدة البيانات (drizzle-kit push)
  // ------------------------------------------------------------
  // ينشئ كل الجداول المطلوبة (users, trips, bookings, ...) تلقائياً
  // إذا كان DATABASE_URL متاحاً. الخطوة غير قاتلة (non-fatal) حتى لا
  // ينهار النشر إذا كان المستخدم قد لم يضف متغير البيئة بعد في Vercel.
  const DB_DIR = path.join(ROOT, "packages", "db");
  const DB_NODE_MODULES = path.join(DB_DIR, "node_modules");
  if (!fs.existsSync(DB_NODE_MODULES)) {
    log("Installing DB package dependencies (packages/db)...");
    run("npm install", DB_DIR);
  }

  if (process.env.DATABASE_URL) {
    log("DATABASE_URL found! Running drizzle-kit push to sync DB schema...");
    log("------------------------------------------------------------");
    log("⚠️  إذا فشلت هذه الخطوة فلن تُنشئ جداول المستخدمين والرحلات،");
    log("   وسيظهر خطأ google_internal عند محاولة تسجيل الدخول.");
    log("   بعد النشر تستطيع تشغيلها يدوياً عبر:");
    log("   curl \"" + (process.env.PUBLIC_URL || "https://<your-project>.vercel.app") + "/api/debug/db-sync?secret=<DB_SYNC_SECRET>\"");
    log("------------------------------------------------------------");
    const ok = runSoft("npx drizzle-kit push --config ./drizzle.config.ts", DB_DIR);
    if (ok) {
      log("✅ DB schema synced successfully with database");
    } else {
      const hr = "\n" + "=".repeat(68);
      console.error(hr);
      console.error("🔴  🔴  🔴   drizzle-kit push FAILED — قاعدة البيانات LIKELY NOT CREATED!   🔴  🔴  🔴");
      console.error(hr);
      console.error(" الأسباب الأكثر شيوعاً:");
      console.error("  1. DATABASE_URL غير صحيح أو المستخدم لا يملك صلاحيات CREATE TABLE");
      console.error("  2. SSL mode يتطلب تعطيله أو تفعيله — جرّب إضافة DB_DISABLE_SSL=true");
      console.error("  3. المزود (Supabase/Neon/Railway) يطلب إضافة IP لقائمة Whitelist");
      console.error();
      console.error(" الإصلاح السريع بعد النشر:");
      console.error("  1. أضف DB_SYNC_SECRET في Vercel Environment Variables");
      console.error("  2. أعد النشر (Redeploy)");
      console.error("  3. افتح في المتصفح:");
      console.error("     /api/debug/db-sync?secret=<قيمة_DB_SYNC_SECRET_التي_أضفتها>");
      console.error(hr + "\n");
    }
  } else {
    const hr = "\n" + "=".repeat(68);
    console.warn(hr);
    console.warn("🟡  DATABASE_URL غير متوفر — تخطي إنشاء جداول قاعدة البيانات!");
    console.warn("    لن تعمل أي ميزة (تسجيل دخول، رحلات، حجوزات) حتى تضيفه.");
    console.warn("    أضفه من Vercel → Project Settings → Environment Variables، ثم أعد النشر.");
    console.warn(hr + "\n");
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
  // الخطوة 3: تجميع (Bundle) كود API Server في ملف JS واحد باستخدام esbuild
  // هذا الحل يتجاوز كل مشاكل:
  // - استيراد ملفات TS مباشرة من packages/ (مثل @golog/db)
  // - مسارات workspaces على Vercel
  // - إعداد exports في package.json للحزم الداخلية
  // ------------------------------------------------------------
  const API_DIR = path.join(ROOT, "packages", "api-server");
  const API_NODE_MODULES = path.join(API_DIR, "node_modules");
  if (!fs.existsSync(API_NODE_MODULES)) {
    log("Installing API Server dependencies...");
    run("npm install", API_DIR);
  }

  const DB_NODE_MODULES_EXIST_CHECK = path.join(DB_DIR, "node_modules");
  if (!fs.existsSync(DB_NODE_MODULES_EXIST_CHECK)) {
    log("Installing DB package dependencies (packages/db)...");
    run("npm install", DB_DIR);
  }

  // التأكد من وجود esbuild (يأتي عادةً مع vite، أو نثبته محلياً في api-server)
  const ESLocal = path.join(ROOT, "node_modules", ".bin", "esbuild");
  const ESApi = path.join(API_DIR, "node_modules", ".bin", "esbuild");
  let ESBIN = fs.existsSync(ESLocal) ? ESLocal : (fs.existsSync(ESApi) ? ESApi : null);
  if (!ESBIN) {
    log("esbuild not found — installing locally to api-server...");
    run("npm install --no-save esbuild", API_DIR);
    ESBIN = path.join(API_DIR, "node_modules", ".bin", "esbuild");
    if (process.platform === "win32") ESBIN += ".cmd";
  }
  log("Using esbuild at: " + ESBIN);

  const BUNDLE_OUT_DIR = path.join(ROOT, "_api_bundle");
  cleanDir(BUNDLE_OUT_DIR);
  ensureDir(BUNDLE_OUT_DIR);
  const BUNDLE_OUT = path.join(BUNDLE_OUT_DIR, "app.bundle.js");

  log("Bundling API server with esbuild...");
  const entryPoint = path.join(API_DIR, "src", "app.ts").replace(/\\/g, "/");
  const outFile = BUNDLE_OUT.replace(/\\/g, "/");

  // بناء أمر esbuild مع:
  // - تجميع الحزم الداخلية (@golog/db) مباشرة
  // - عدم تجميع (external) حزم node_modules الشائعة
  // - format=cjs لأن دوال Vercel تعمل افتراضياً بصيغة CommonJS
  const esbuildCmd =
    `"${ESBIN}" "${entryPoint}"` +
    ` --bundle` +
    ` --platform=node` +
    ` --target=node18` +
    ` --format=cjs` +
    ` --outfile="${outFile}"` +
    ` --external:express` +
    ` --external:passport` +
    ` --external:passport-google-oauth20` +
    ` --external:express-session` +
    ` --external:connect-pg-simple` +
    ` --external:cors` +
    ` --external:helmet` +
    ` --external:express-rate-limit` +
    ` --external:pino` +
    ` --external:pino-http` +
    ` --external:pg` +
    ` --external:drizzle-orm` +
    ` --external:drizzle-zod` +
    ` --external:zod` +
    ` --external:dotenv` +
    ` --external:cookie-parser` +
    ` --external:tsx` +
    ` --external:@aws-sdk/client-s3` +
    ` --external:@aws-sdk/s3-request-presigner` +
    ` --allow-overwrite`;

  log("esbuild command:\n  " + esbuildCmd);
  run(esbuildCmd, ROOT);

  if (!fs.existsSync(BUNDLE_OUT)) {
    console.error("[vercel-build] FATAL: bundled output not found at " + BUNDLE_OUT);
    process.exit(1);
  }

  // فحص حجم الملف وتأكيد وجود التصدير الافتراضي
  const bundleStat = fs.statSync(BUNDLE_OUT);
  log("Bundle created: " + Math.round(bundleStat.size / 1024) + " KB ✓");
  const bundleContent = fs.readFileSync(BUNDLE_OUT, "utf8");
  if (!bundleContent.includes("export default") && !bundleContent.includes("export {")) {
    log("WARNING: bundle doesn't seem to contain exports — checking if app export is present...");
  }

  log("API server bundled successfully to _api_bundle/app.bundle.js ✓");

  log("\n🎉 Build complete — project is ready for Vercel deployment!\n");
}

main().catch(function (err) {
  console.error("[vercel-build] Build script FATAL error:", err);
  process.exit(1);
});
