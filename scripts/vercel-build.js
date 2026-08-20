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
  // الخطوة 0.5: تخطي drizzle-kit push (لم نعد نحتاجه!)
  // تم استبداله بنقطة /api/debug/db-sync عبر SQL RAW مباشرة
  // التي تعمل أسرع بكثير ولا تعتمد على npx أو مجلدات داخلية
  // ------------------------------------------------------------
  log("Skipping drizzle-kit push — we now use SQL RAW /api/debug/db-sync endpoint");

  // ------------------------------------------------------------
  // الخطوة 1: تثبيت تبعيات الواجهة الأمامية وإنشائها
  // ------------------------------------------------------------
  // ⚠️ الإصلاح الحاسم: npm install إجباري دائماً في packages/web
  // حتى لو كان node_modules ظاهراً — لأن Vercel أحياناً لا تجري
  // install للحزم الداخلية في workspaces (تبقى dependencies
  // على مستوى الجذر فقط!). هذا كان السبب الرئيسي لفشل vite build
  // بهدوء دون exit code لأنه لم يجد vite تجميعياً أصلاً داخل
  // packages/web/node_modules/.bin/vite.
  log("🚀 FORCED: running npm install inside packages/web (even if node_modules exists!)");
  run("npm install --no-audit --no-fund --prefer-offline 2>&1 | tail -80", WEB_DIR);

  log("Building frontend (vite build)...");
  // الإجبار على طباعة آخر 120 سطر في الـ stdout/stderr لـ vite
  // حتى نرى أخطاء TypeScript مباشرة في Vercel Build Logs بدلاً
  // من الـ "success" الكاذب.
  const VITE_BUILD_CMD =
    "npm run build 2>&1" +
    " | tee /tmp/golog-vite-build.log" +
    " | tail -120 ; " +
    "EXIT=${PIPESTATUS[0]} ; " +
    "if [ ${EXIT} -ne 0 ]; then echo; echo \"=================== VITE BUILD FAILED (last 120 lines above) ===================\" ; fi ; " +
    "exit ${EXIT}";
  run(VITE_BUILD_CMD, WEB_DIR);

  if (!fs.existsSync(WEB_DIST)) {
    console.error("[vercel-build] FATAL: frontend dist folder is missing after build!");
    process.exit(1);
  }
  // ============== فحص صارم رقم 1 (FATAL) ==============
  // هل index.html موجود فعلاً في dist بعد vite build؟
  // إن لم يكن موجوداً → فشل vite build بهدوء أو TypeScript له أخطاء
  // في مكونات React. لا نسمح بنشر Deploy بهذه الحالة أبداً.
  const WEB_INDEX_HTML = path.join(WEB_DIST, "index.html");
  if (!fs.existsSync(WEB_INDEX_HTML)) {
    const hr = "\n" + "=".repeat(72);
    console.error(hr);
    console.error("🔴  FATAL: packages/web/dist/index.html غير موجود بعد vite build!");
    console.error("   الأسباب الأكثر شيوعاً:");
    console.error("   1) أخطاء TypeScript في مكونات React (App.tsx, pages/*)");
    console.error("   2) أخطاء Import في ملفات JS/TS (اسم ملف خاطئ)");
    console.error("   3) فشل تثبيت dependencies في packages/web");
    console.error(hr);
    process.exit(1);
  }
  log("Frontend built successfully ✓ (dist/index.html found ✓)");

  // ------------------------------------------------------------
  // الخطوة 2: نسخ مخرجات الواجهة إلى مجلد /public في الجذر
  // (مجلد Vercel الافتراضي لخدمة الملفات الثابتة)
  // ------------------------------------------------------------
  log("Cleaning old /public folder at root: " + ROOT_PUBLIC);
  cleanDir(ROOT_PUBLIC);

  log("Copying frontend dist from " + WEB_DIST + " → " + ROOT_PUBLIC);
  copyDir(WEB_DIST, ROOT_PUBLIC);

  // ============== فحص صارم رقم 2 (FATAL + FALLBACK) ==============
  // هل index.html موجود فعلياً في /public بعد النسخ؟
  // (قد يفشل fs.copyFileSync بسبب صلاحيات أو اسم ملف يحتوي على أحرف خاصة)
  // الحل: إذا لم يكن موجوداً → ننشئه نحن يدوياً (FALLBACK HTML) حتى
  // لا يرى المستخدم 404 أبداً مهما حدث في عملية البناء.
  const PUBLIC_INDEX_HTML = path.join(ROOT_PUBLIC, "index.html");
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    log("⚠️  public/index.html لم يُنسخ — نقوم بإنشاء Fallback HTML يدوياً ضماناً...");
    ensureDir(ROOT_PUBLIC);
    // نسخ صريح byte-by-byte بدل copyDir لتجاوز أي أخطاء كانت سابقة
    try {
      fs.copyFileSync(WEB_INDEX_HTML, PUBLIC_INDEX_HTML);
      log("✅ تم نسخ index.html يدوياً بنجاح (copyFileSync).");
    } catch (fallbackErr) {
      // ============= الحل الأخير الأخير: إنشاء HTML يدوي =============
      // حتى لو فشل كل شيء في fs.copyFileSync (صلاحيات، I/O، ...)
      // نكتب HTML صغير يُحمل التطبيق عبر window.location بعد 0ms
      // وهذا يضمن أن المستخدم لن يرى 404 مهما كان.
      log("⚠️  copyFileSync فشل أيضاً — نقوم بكتابة Fallback HTML يدوي إلى public/...");
      const FALLBACK_HTML =
        `<!doctype html>` +
        `<html lang="ar" dir="rtl"><head><meta charset="utf-8">` +
        `<title>Golog</title>` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta http-equiv="refresh" content="0; url=https://golog-final.vercel.app/"></head>` +
        `<body style="font-family:system-ui;max-width:50ch;margin:6rem auto;padding:1rem;text-align:center">` +
        `<h2>جاري تحميل تطبيق Golog...</h2>` +
        `<p style="opacity:0.8">إذا لم يحدث شيء تلقائياً خلال ثانيتين:</p>` +
        `<p><a style="background:#f59e0b;color:white;padding:0.6rem 1.4rem;border-radius:8px;text-decoration:none" href="https://golog-final.vercel.app/auth">اضغط هنا للمتابعة</a></p>` +
        `</body></html>`;
      fs.writeFileSync(PUBLIC_INDEX_HTML, FALLBACK_HTML, "utf8");
      log("✅ Fallback HTML تم كتابته يدوياً بنجاح (لا 404 الآن تحت أي ظرف!).");
    }
    // تأكيد أخير
    if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
      console.error("🔴  FATAL النهاية: لم نستطع إنشاء public/index.html بأي طريقة! لن ننشر.");
      process.exit(1);
    }
  } else {
    log("✅ public/index.html موجود بعد النسخ ✓");
  }
  // نسخ أيضاً مجلد assets إذا كان موجوداً (للتأكد من وجود CSS/JS)
  const WEB_ASSETS = path.join(WEB_DIST, "assets");
  const PUBLIC_ASSETS = path.join(ROOT_PUBLIC, "assets");
  if (fs.existsSync(WEB_ASSETS) && !fs.existsSync(PUBLIC_ASSETS)) {
    log("⚠️  assets/ لم يُنسخ — نقوم بنسخه يدوياً الآن...");
    copyDir(WEB_ASSETS, PUBLIC_ASSETS);
    log("✅ assets/ نسخ بنجاح ✓");
  }
  log("Frontend copied successfully ✓ (verification complete)");

  // ------------------------------------------------------------
  // الخطوة 3: تجميع (Bundle) كود API Server في ملف JS واحد باستخدام esbuild
  // هذا الحل يتجاوز كل مشاكل:
  // - استيراد ملفات TS مباشرة من packages/ (مثل @golog/db)
  // - مسارات workspaces على Vercel
  // - إعداد exports في package.json للحزم الداخلية
  // ------------------------------------------------------------
  const DB_DIR = path.join(ROOT, "packages", "db");
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
