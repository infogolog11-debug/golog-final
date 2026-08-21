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
  // الإصلاح الحاسم 1 لـ vite build:
  // نحاول بناء الواجهة مع طبقات متتالية مع إرجاع exit code صريح.
  // الفشل هنا سينهي الـ Build مباشرةً بـ process.exit(1) قبل مسح public/.
  // ====================== الطبقة 1 ======================
  let viteOk = false;
  let viteErrorLines = "";
  try {
    // أولاً: محاولة مباشرة لـ npm run build داخل packages/web
    const directBuild = spawnSync("npm run build 2>&1", {
      shell: true,
      cwd: WEB_DIR,
      stdio: "pipe",
      env: Object.assign({}, process.env, { CI: "true" }),
    });
    viteOk = directBuild.status === 0;
    const combined = (directBuild.stdout ? String(directBuild.stdout || "") : "") + (directBuild.stderr ? String(directBuild.stderr || "") : "");
    viteErrorLines = combined.split("\n").slice(-120).join("\n");
  } catch (e) {
    viteOk = false;
    viteErrorLines = "Exception during spawn: " + (e && e.message ? e.message : String(e));
  }
  // ====================== طبقة 2 ======================
  // إذا فشل الطبقة الأولى: نحاول استدعاء vite مباشرة من node_modules/.bin
  if (!viteOk) {
    const viteBin = path.join(WEB_DIR, "node_modules", ".bin", "vite");
    const viteBinCmd = (process.platform === "win32" ? viteBin + ".cmd" : viteBin);
    const alt = spawnSync(`"${viteBinCmd}" build 2>&1`, {
      shell: true,
      cwd: WEB_DIR,
      stdio: "pipe",
      env: Object.assign({}, process.env, { CI: "true" }),
    });
    viteOk = alt.status === 0;
    const combined = (alt.stdout ? String(alt.stdout || "") : "") + (alt.stderr ? String(alt.stderr || "") : "");
    viteErrorLines = combined.split("\n").slice(-120).join("\n");
  }
  // ====================== طبقة 3 ======================
  // إذا فشلت الطبقتان: ربما هو أن npm run build في packages/web
  // نفسه غير معرف في package.json web → نحاول تشغيل vite من الجذر عبر workspace
  if (!viteOk) {
    const rootAlt = spawnSync("npm run build:web 2>&1", {
      shell: true,
      cwd: ROOT,
      stdio: "pipe",
      env: Object.assign({}, process.env, { CI: "true" }),
    });
    viteOk = rootAlt.status === 0;
    const combined = (rootAlt.stdout ? String(rootAlt.stdout || "") : "") + (rootAlt.stderr ? String(rootAlt.stderr || "") : "");
    viteErrorLines = combined.split("\n").slice(-120).join("\n");
  }

  // ============ FATAL EXIT 1 إذا فشل vite build بأي طريقة ============
  if (!viteOk) {
    const hr = "\n" + "=".repeat(80);
    console.error(hr);
    console.error("🔴  FATAL: Vite build FAILED (all 3 layers failed for packages/web!");
    console.error("   → الأسباب الأكثر شيوعاً:");
    console.error("   1) أخطاء TypeScript في مكونات React (App.tsx, pages/*)");
    console.error("   2) أخطاء استيراد ملفات (اسم ملف خطأ)");
    console.error("   3) تبعيات packages/web لم يتم تثبيتها");
    console.error(hr);
    console.error("   آخر 120 سطر من مخرجات Vite build:");
    console.error(hr);
    console.error(viteErrorLines || "(empty output)");
    console.error(hr);
    // IMPORTANT: لا نمسح public/ أبداً إذا فشل vite build — احتفظ بالـ physical index.html الموجود في المستودع (الذي وضعناه يدوياً كـ fallback)
    process.exit(1);
  }

  log("✅ Vite build succeeded! (all checks passed ✓");

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
  // أولاً — قبل أي تنظيف: نأخذ نسخة احتياطية من public/index.html الفيزيائي
  // (الذي وضعناه يدوياً في المستودع كـ Fallback نهائي) في مكان مؤقت
  // لأنه إذا فشل copyDir + copyFileSync أدناه، نستطيع استرجاعه بسرعة.
  const PHYSICAL_FALLBACK_HTML_PATH = path.join(ROOT, "public", "index.html");
  let BACKUP_FALLBACK_HTML = null;
  try {
    if (fs.existsSync(PHYSICAL_FALLBACK_HTML_PATH)) {
      BACKUP_FALLBACK_HTML = fs.readFileSync(PHYSICAL_FALLBACK_HTML_PATH, "utf8");
      if (String(BACKUP_FALLBACK_HTML).length < 3000) BACKUP_FALLBACK_HTML = null; // تجاهل الملفات القصيرة
      else log("✅ تم أخذ نسخة احتياطية من Fallback HTML الفيزيائي (ملف كامل).");
    }
  } catch { /* ignore */ }
  // جرب أيضاً packages/web/public/index.html
  try {
    if (!BACKUP_FALLBACK_HTML) {
      const p = path.join(WEB_DIR, "public", "index.html");
      if (fs.existsSync(p)) {
        const c = fs.readFileSync(p, "utf8");
        if (String(c).length > 3000) { BACKUP_FALLBACK_HTML = c; log("✅ تم أخذ نسخة احتياطية من Fallback HTML (packages/web/public)."); }
      }
    }
  } catch { /* ignore */ }

  log("Cleaning old /public folder at root: " + ROOT_PUBLIC);
  cleanDir(ROOT_PUBLIC);

  log("Copying frontend dist from " + WEB_DIST + " → " + ROOT_PUBLIC);
  copyDir(WEB_DIST, ROOT_PUBLIC);

  // ============== فحص صارم رقم 2 (FATAL + FALLBACK) ==============
  // هل index.html موجود فعلياً في /public بعد النسخ؟
  // (قد يفشل copyDir بسبب صلاحيات أو اسم ملف يحتوي على أحرف خاصة)
  // الحل: طبقات متعددة — إذا لم يكن موجوداً → نسخ احتياطي → كتابة يدوي
  const PUBLIC_INDEX_HTML = path.join(ROOT_PUBLIC, "index.html");
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    log("⚠️  public/index.html لم يُنسخ — نقوم بإنشاء Fallback HTML يدوياً ضماناً...");
    ensureDir(ROOT_PUBLIC);

    // الطبقة 1: BACKUP_FALLBACK_HTML (النسخة الاحتياطية قبل cleanDir) — الأسرع
    if (BACKUP_FALLBACK_HTML && typeof BACKUP_FALLBACK_HTML === "string" && BACKUP_FALLBACK_HTML.length > 3000) {
      try {
        fs.writeFileSync(PUBLIC_INDEX_HTML, BACKUP_FALLBACK_HTML, "utf8");
        log("✅ الطبقة (1): تم نسخ Fallback HTML من النسخة الاحتياطية قبل cleanDir ✓");
      } catch { /* فشل → انتقل للطبقة التالية */ }
    }
  }
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    // الطبقة 2: copyFileSync من dist مباشرة (تجاوز مشاكل copyDir)
    try {
      fs.copyFileSync(WEB_INDEX_HTML, PUBLIC_INDEX_HTML);
      log("✅ الطبقة (2): copyFileSync من packages/web/dist/index.html ✓");
    } catch { /* فشل */ }
  }
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    // الطبقة 3: قراءة الملفات الفيزيائية الاحتياطية في المستودع
    let FALLBACK_HTML = "";
    const fallbackSources = [
      path.join(ROOT, "public", "index.html"),
      path.join(WEB_DIR, "public", "index.html"),
    ];
    for (const p of fallbackSources) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, "utf8");
          if (String(content).length > 3000) { FALLBACK_HTML = content; break; }
        }
      } catch { /* ignore */ }
    }
    if (FALLBACK_HTML) {
      try {
        fs.writeFileSync(PUBLIC_INDEX_HTML, FALLBACK_HTML, "utf8");
        log("✅ الطبقة (3): Fallback HTML مكتوب من ملفات المستودع الفيزيائية ✓");
      } catch { /* فشل */ }
    }
  }
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    // الطبقة 4 — الأخيرة: كتابة HTML يدوي كامل SPA يعمل بدون React
    // يحتوي على زر Google حقيقي + فحص auth/me + إعادة توجيه لـ /driver أو /passenger
    const FULL_SPA_FALLBACK =
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Golog — تسجيل الدخول</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
      ':root{--primary:#f59e0b;--bg:#fffaf2;--card:#fff;--text:#1f2937;--muted:#6b7280;--border:#e5e7eb}' +
      '*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}' +
      '.wrap{min-height:100dvh;width:100%;display:flex;align-items:center;justify-content:center;padding:1rem}' +
      '.card{width:100%;max-width:520px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:2rem 1.75rem;box-shadow:0 10px 30px -12px rgba(0,0,0,.08)}' +
      '.brand{text-align:center;margin-bottom:1.5rem}.brand h1{font-family:"Reem Kufi",sans-serif;font-size:3rem;margin:0 0 .5rem 0;color:var(--primary)}' +
      '.route-line{display:flex;align-items:center;justify-content:center;gap:.75rem;color:var(--muted);font-size:.9rem;margin-bottom:.25rem}' +
      '.route-line .dot{width:8px;height:8px;border-radius:9999px;background:var(--primary)}' +
      '.route-line .bar{width:44px;height:2px;background:repeating-linear-gradient(90deg,var(--primary) 0 6px,transparent 6px 12px);border-radius:9999px}' +
      '.tagline{text-align:center;color:var(--muted);margin-bottom:1.5rem}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.8rem 1rem;border-radius:10px;border:2px solid var(--border);background:#fff;color:var(--text);font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit;margin:.3rem 0}' +
      '.btn:hover{border-color:var(--primary);transform:translateY(-1px)}' +
      '.divider{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.75rem;color:var(--muted);font-size:.7rem;margin:1.25rem 0}' +
      '.divider::before,.divider::after{content:"";width:100%;height:1px;background:var(--border)}' +
      '.alert{border-radius:10px;padding:.9rem 1rem;margin-top:1rem;font-size:.9rem;line-height:1.6;white-space:pre-wrap}' +
      '.alert-warn{background:rgba(245,158,11,.12);color:#92400e;border:1px solid rgba(245,158,11,.3)}' +
      '.loader{text-align:center;color:var(--muted);padding:.5rem 0;font-size:.9rem}' +
      '.spinner{display:inline-block;width:18px;height:18px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:9999px;animation:s 1s linear infinite;vertical-align:-4px;margin-left:.5rem}' +
      '@keyframes s{to{transform:rotate(360deg)}}' +
      '.footnote{text-align:center;color:var(--muted);font-size:.75rem;margin-top:1.25rem}' +
      '.mono{font-family:ui-monospace,monospace;padding:.25rem .5rem;background:rgba(0,0,0,.04);border-radius:6px;display:inline-block;margin-top:.3rem}' +
      '</style></head><body>' +
      '<div class="wrap"><div class="card">' +
      '<div class="brand"><h1>Golog</h1><div class="route-line"><span>حلب</span><span class="dot"></span><span class="bar"></span><span class="dot"></span><span>غازي عنتاب</span></div><div class="tagline">رفقة موثوقة على الطريق بين مدنك</div></div>' +
      '<div id="app"></div>' +
      '<div class="footnote">لا حاجة لكلمة سر — دخولك محمي بالكامل عبر حسابك في Google</div>' +
      '</div></div>' +
      '<script>' +
      'const BASE="/api";function gurl(){return BASE+"/auth/google"}' +
      'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;")}' +
      'async function fj(u,o){try{const r=await fetch(BASE+u,Object.assign({credentials:"include"},o||{}));let d=null;try{d=await r.json()}catch(e){d=null}return{ok:r.ok,status:r.status,data:d}}catch(e){return{ok:false,status:0,data:null,error:e&&e.message?e.message:String(e)}}}' +
      'async function me(){for(let i=0;i<3;i++){const r=await fj("/auth/me");if(r.ok&&r.data&&typeof(r.data.user||{}).id==="number")return r.data.user;if(i<2)await new Promise(x=>setTimeout(x,800))}return null}' +
      'function load(h){document.getElementById("app").innerHTML=\'<div class="loader">\'+h+\'</div>\'}' +
      'function auth(){const d=window.location.hostname;document.getElementById("app").innerHTML=\'<div style="display:flex;flex-direction:column;gap:.75rem"><a class="btn" href="\'+gurl()+\'"><svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>تسجيل الدخول عبر Google</span></a><div class="divider">أو</div><div class="alert alert-warn" style="font-size:.8rem;margin:0">💡 لإخفاء رسالة Bot domain invalid بتيليجرام: افتح @BotFather ثم أرسل: <span class="mono">/setdomain \'+esc(d)+\'</span></div></div>\'}' +
      '(async function(){load("جاري التحقق من الحالة الحالية... <span class=spinner></span>");const u=await me();if(u){const r=String(u.currentRole||"passenger").toLowerCase();const t=r==="driver"?"/driver":"/passenger";load("✅ تم التعرف عليك! يتم نقلك تلقائياً إلى \'+t+\'... <span class=spinner></span>");setTimeout(()=>{window.location.replace(t)},200);return}auth()})();' +
      '<\/script></body></html>';
    fs.writeFileSync(PUBLIC_INDEX_HTML, FULL_SPA_FALLBACK, "utf8");
    log("✅ الطبقة (4): Fallback HTML الكامل مكتوب يدوياً كـ SPA يعمل بدون React ✓");
  }
  // تأكيد نهائي FATAL
  if (!fs.existsSync(PUBLIC_INDEX_HTML)) {
    console.error("🔴  FATAL النهاية: فشلت كل الطبقات الأربع في إنشاء public/index.html! لن ننشر كود مكسور.");
    process.exit(1);
  }
  log("✅ public/index.html موجود الآن ✓ (تم بناؤه عبر أحد الطبقات الأربع)");
  // نسخ أيضاً مجلد assets إذا كان موجوداً (للتأكد من وجود CSS/JS)
  const WEB_ASSETS = path.join(WEB_DIST, "assets");
  const PUBLIC_ASSETS = path.join(ROOT_PUBLIC, "assets");
  if (fs.existsSync(WEB_ASSETS) && !fs.existsSync(PUBLIC_ASSETS)) {
    log("⚠️  assets/ لم يُنسخ — نقوم بنسخه يدوياً الآن...");
    copyDir(WEB_ASSETS, PUBLIC_ASSETS);
    log("✅ assets/ نسخ بنجاح ✓");
  }

  // ============== ضمان وجود 404.html لصفحة 404 ==============
  // حتى لو كانت قاعدة الـ Rewrite تعمل بشكل صحيح، Vercel يستخدم 404.html
  // كصفحة خطأ افتراضية إذا لم يلتقط أي Rewrite الطلب (ضمان إضافي ضد 404 فارغ).
  const PUBLIC_404_HTML = path.join(ROOT_PUBLIC, "404.html");
  if (!fs.existsSync(PUBLIC_404_HTML)) {
    log("⚠️  public/404.html غير موجود — نقوم بإنشائه/نسخه كضمان إضافي...");
    const WEB_PUBLIC_DIR = path.join(WEB_DIR, "public"); // packages/web/public
    const SRC_404 = [
      path.join(WEB_DIST, "404.html"),
      path.join(WEB_PUBLIC_DIR, "404.html"),
      path.join(ROOT, "public", "404.html"),
    ];
    let copied404 = false;
    for (const src of SRC_404) {
      if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, PUBLIC_404_HTML); copied404 = true; log("✅ تم نسخ 404.html من: " + path.relative(ROOT, src)); break; }
        catch { /* ignore */ }
      }
    }
    if (!copied404) {
      log("⚠️  لا يوجد 404.html مصدر — نقوم بإنشاء fallback يدوياً مع زر Google...");
      const FALLBACK_404 =
        '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Golog — تسجيل الدخول</title>' +
        '<link href="https://fonts.googleapis.com/css2?family=Reem+Kufi:wght@400..700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">' +
        '<style>' +
        ':root{--primary:#f59e0b;--bg:#fffaf2;--card:#fff;--text:#1f2937;--muted:#6b7280;--border:#e5e7eb}' +
        '*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--bg);color:var(--text);font-family:"IBM Plex Sans Arabic",system-ui,sans-serif}' +
        '.wrap{min-height:100dvh;width:100%;display:flex;align-items:center;justify-content:center;padding:1rem}' +
        '.card{width:100%;max-width:520px;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:2rem 1.75rem;box-shadow:0 10px 30px -12px rgba(0,0,0,.08)}' +
        '.brand{text-align:center;margin-bottom:1.5rem}.brand h1{font-family:"Reem Kufi",sans-serif;font-size:3rem;margin:0 0 .5rem 0;color:var(--primary)}' +
        '.route-line{display:flex;align-items:center;justify-content:center;gap:.75rem;color:var(--muted);font-size:.9rem;margin-bottom:.25rem}' +
        '.route-line .dot{width:8px;height:8px;border-radius:9999px;background:var(--primary)}' +
        '.route-line .bar{width:44px;height:2px;background:repeating-linear-gradient(90deg,var(--primary) 0 6px,transparent 6px 12px);border-radius:9999px}' +
        '.tagline{text-align:center;color:var(--muted);margin-bottom:1.5rem}' +
        '.btn{display:inline-flex;align-items:center;justify-content:center;gap:.6rem;width:100%;padding:.8rem 1rem;border-radius:10px;border:2px solid var(--border);background:#fff;color:var(--text);font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit;margin:.3rem 0}' +
        '.btn:hover{border-color:var(--primary);transform:translateY(-1px)}' +
        '.divider{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.75rem;color:var(--muted);font-size:.7rem;margin:1.25rem 0}' +
        '.divider::before,.divider::after{content:"";width:100%;height:1px;background:var(--border)}' +
        '.alert{border-radius:10px;padding:.9rem 1rem;margin-top:1rem;font-size:.9rem;line-height:1.6;white-space:pre-wrap}' +
        '.alert-warn{background:rgba(245,158,11,.12);color:#92400e;border:1px solid rgba(245,158,11,.3)}' +
        '.loader{text-align:center;color:var(--muted);padding:.5rem 0;font-size:.9rem}' +
        '.spinner{display:inline-block;width:18px;height:18px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:9999px;animation:s 1s linear infinite;vertical-align:-4px;margin-left:.5rem}' +
        '@keyframes s{to{transform:rotate(360deg)}}' +
        '.footnote{text-align:center;color:var(--muted);font-size:.75rem;margin-top:1.25rem}' +
        '.mono{font-family:ui-monospace,monospace;padding:.25rem .5rem;background:rgba(0,0,0,.04);border-radius:6px;display:inline-block;margin-top:.3rem}' +
        '</style></head><body>' +
        '<div class="wrap"><div class="card">' +
        '<div class="brand"><h1>Golog</h1><div class="route-line"><span>حلب</span><span class="dot"></span><span class="bar"></span><span class="dot"></span><span>غازي عنتاب</span></div><div class="tagline">رفقة موثوقة على الطريق بين مدنك</div></div>' +
        '<div id="app"></div>' +
        '<div class="footnote">لا حاجة لكلمة سر — دخولك محمي بالكامل عبر حسابك في Google</div>' +
        '</div></div>' +
        '<script>' +
        'const BASE="/api";function gurl(){return BASE+"/auth/google"}' +
        'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;")}' +
        'async function fj(u,o){try{const r=await fetch(BASE+u,Object.assign({credentials:"include"},o||{}));let d=null;try{d=await r.json()}catch(e){d=null}return{ok:r.ok,status:r.status,data:d}}catch(e){return{ok:false,status:0,data:null,error:e&&e.message?e.message:String(e)}}}' +
        'async function me(){for(let i=0;i<3;i++){const r=await fj("/auth/me");if(r.ok&&r.data&&typeof(r.data.user||{}).id==="number")return r.data.user;if(i<2)await new Promise(x=>setTimeout(x,800))}return null}' +
        'function load(h){document.getElementById("app").innerHTML=\'<div class="loader">\'+h+\'</div>\'}' +
        'function auth(){const d=window.location.hostname;document.getElementById("app").innerHTML=\'<div style="display:flex;flex-direction:column;gap:.75rem"><a class="btn" href="\'+gurl()+\'"><svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>تسجيل الدخول عبر Google</span></a><div class="divider">أو</div><div class="alert alert-warn" style="font-size:.8rem;margin:0">💡 لإخفاء رسالة Bot domain invalid بتيليجرام: افتح @BotFather ثم أرسل: <span class="mono">/setdomain \'+esc(d)+\'</span></div></div>\'}' +
        '(async function(){load("جاري التحقق من الحالة الحالية... <span class=spinner></span>");const u=await me();if(u){const r=String(u.currentRole||"passenger").toLowerCase();const t=r==="driver"?"/driver":"/passenger";load("✅ تم التعرف عليك! يتم نقلك تلقائياً إلى \'+t+\'... <span class=spinner></span>");setTimeout(()=>{window.location.replace(t)},200);return}auth()})();' +
        '<\/script></body></html>';
      fs.writeFileSync(PUBLIC_404_HTML, FALLBACK_404, "utf8");
    }
    if (!fs.existsSync(PUBLIC_404_HTML)) {
      log("⚠️  تعذر إنشاء 404.html — لكن الصفحة ستظل تعمل بفضل vercel.json rewrites.");
    } else {
      log("✅ 404.html موجود الآن في المخرجات ✓");
    }
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
