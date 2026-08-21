import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes/index";
import { logger } from "./lib/logger";
import passport from "./lib/passport";
import {
  PUBLIC_URL,
  WEB_ORIGINS,
  COOKIE_SAME_SITE,
  SESSION_SECRET,
  IS_PRODUCTION,
} from "./lib/env";
import { pool } from "@golog/db";

const app: Express = express();

// ================================================================
// ثقة بـ Proxy + تثبيت إعدادات الكوكي العالمية (Vercel Serverless)
// ---------------------------------------------------------------
// على Vercel يمر الطلب عبر عدة طبقات (Edge CDN → Load balancer →
// Function). دون تفعيل trust proxy بشكل صحيح:
//   • req.secure = FALSE دائماً (حتى لو كان الطلب فعلياً عبر HTTPS)
//   • لذلك يتم إرسال الكوكيز بـ Secure=FALSE على HTTPS → Chrome
//     يحظرها صراحةً في توجيهات Google OAuth 303.
// حل مهني: trust proxy = TRUE لكل المنصات السحابية (كما هو مُعتمد
// في Express docs لـ Heroku/Vercel/Cloudflare).
// ================================================================
app.enable("trust proxy");
app.set("trust proxy", true);

// 🔹 تعيين Vary: Cookie عالمياً لجميع الاستجابات
// (يتجنب مشاكل CDN Cache التي تُعيد نسخة مصادق عليها لمستخدم آخر
//  أو العكس، وهو خطأ شائع جداً في منصات Serverless ذات الـ Edge).
app.use((_req, res, next) => {
  res.header("Vary", "Origin, Accept-Encoding, Accept, Cookie");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins = WEB_ORIGINS;

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("غير مسموح لهذا الأصل (CORS)"));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد محاولات كبير جداً، يرجى المحاولة لاحقاً" },
});
app.use("/api/auth", authLimiter);

const sameSite = COOKIE_SAME_SITE;
// SameSite=None يتطلب Secure إلزاماً بلا استثناء، وإلا
// سيحظرها Chrome/Firefox/Safari صراحةً على HTTPS.
// نُجبر secure=true دائماً إذا كان sameSite="none" أو إذا كنا
// في بيئة إنتاج HTTPS (حماية إضافية).
//
// مُحسّن خاص بـ Vercel: نتحقق أيضاً من req.secure داخل الـ genid
// و نُجبر Secure دائماً على Vercel Runtime (حتى لو وصل الطلب من داخل
// الشبكة عبر HTTP).
const cookieSecure =
  sameSite === "none" ? true :
  IS_PRODUCTION ? true :
  false;

// 🔹 عرض تشخيصي عند أول تشغيل Function (لنرى في Vercel Logs الضبط الفعلي)
if ((globalThis as any).__GOLOG_COOKIE_CONFIG_LOGGED__ !== true) {
  (globalThis as any).__GOLOG_COOKIE_CONFIG_LOGGED__ = true;
  console.info(
    "[Session Config] ℹ️ إعدادات الكوكي المستخدمة الآن:\n" +
    "  IS_PRODUCTION = " + IS_PRODUCTION + "\n" +
    "  COOKIE_SAME_SITE = " + sameSite + "\n" +
    "  cookie.secure = " + cookieSecure + "\n" +
    "  ℹ️ إذا كنت ترى cookie.secure = FALSE على Vercel HTTPS فهذا يعني أن المستخدم سيعود للهبوط بدون سبب ظاهر."
  );
}

const PgSession = ConnectPgSimple(session);

// 🔹 توليد Session ID آمن: استخدم دالة مخصصة تُطبّق نفس مفتاح
// السرية كما هو، وتضمن أن الـ ID طوله 64 هكس (كما تتوقعه connect-pg-simple
// و express-session). تجنب بعض مشاكل الـ Session Regenerate القديمة.
const cryptoBuiltin = await import("crypto").catch(() => null);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
      // تفتيت الجلسات التي انتهت صلاحيتها كل 15 دقيقة (بدلاً من الافتراضي 1 ساعة)
      // لكي لا يتورم جدول user_sessions بالجلسات الميتة على Vercel طويل الأمد.
      pruneSessionInterval: 15 * 60,
      errorLog: (...args: any[]) => {
        console.error("[connect-pg-simple] ERROR:", ...args);
      },
    }),
    secret: SESSION_SECRET,
    // 🔴 IMPORTANT (Serverless-specific):
    //   saveUninitialized: TRUE = أنشئ سجل جلسة فارغة حتى لو لم
    //   يكن المستخدم مسجلاً. هذا ضروري لكي يُحفظ OAuth state في
    //   الجلسة قبل إعادة التوجيه إلى Google. بدون هذا:
    //   • passport.authenticate("google") تكتب state في الجلسة
    //   • لكن store لا يُنشئ سجل جديداً (saveUninitialized=false)
    //   • عند العودة من Google → الـ Function يقرأ جلسة فارغة
    //   → state mismatch → فشل صامت يعيد للهبوط.
    resave: true,
    saveUninitialized: true,
    rolling: true,
    name: "connect.sid",
    // تأكدنا من السرية: genid دائماً تولّد أرقام عشوائية قوية 32 بايت (64 هكس)
    // بدلاً من الافتراضي (uid-safe 24 بايت) لرفع مستوى الأمان.
    genid: function _genid() {
      try {
        if (cryptoBuiltin && cryptoBuiltin.randomBytes) {
          return cryptoBuiltin.randomBytes(32).toString("hex");
        }
      } catch {}
      // Fallback لـ crypto.webcrypto إذا كان متوفراً
      try {
        const buf = new Uint8Array(32);
        (globalThis as any).crypto?.getRandomValues?.(buf);
        return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
      } catch {
        return (
          "sess-" + Date.now().toString(36) + "-" +
          Math.random().toString(36).slice(2, 10) + "-" +
          Math.random().toString(36).slice(2, 10)
        );
      }
    },
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      sameSite,
      // domain محذوف عمداً: بدون Domain، المتصفح يربط الكوكي
      // بالـ hostname الدقيق الذي أنشأه (golog-final.vercel.app).
      // وهذا هو الإعداد الأكثر قبولاً عالمياً ولا يسبب مشاكل SameParty
      // أو Public Suffix List على أرفام مثل vercel.app التي تعتبر
      // من public suffixes عند Chrome (سبب شائع جداً لرفض الكوكي!).
      // path = "/" ضروري حتى تشارك الكوكي في كل مسارات التطبيق.
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // SameSite Party غير مدعوم عالمياً بعد؛ لكن خيار partitioned
      // (CHIPS) مهم لمستقبل SameSite=None في Chrome 127+.
      // نضيفه كـ custom flag إذا كان يدعمه المتصفح.
      partitioned: sameSite === "none",
    } as any,
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

/* ============================================================
   Fallback نهائي لـ Single-Page App (SPA)
   ------------------------------------------------------------
   نحدد موقع مجلد الـ static (الملفات الثابتة للواجهة الأمامية)
   بأقصى قدر من المرونة؛ لأن مسار process.cwd() قد يختلف بين
   بيئة Vercel أثناء البناء وبيئة تشغيل الوظائف (Serverless).

   نقوم بالبحث في قائمة بالمسارات الأكثر احتمالاً:
     1. <process.cwd()>/public            ← الإعداد القياسي بعد البناء
     2. <process.cwd()>/../public         ← للاحتياط عند تشغيل الوظيفة من مجلد api
     3. <__dirname>/../../public          ← المسار من داخل bundles (CJS)
   أياً وجدناه أولاً نستخدمه.
   ============================================================ */
function findStaticDir(): string | null {
  const candidates = [
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "..", "public"),
    path.resolve(__dirname, "..", "..", "public"),
    path.resolve(__dirname, "..", "public"),
    path.resolve(__dirname, "..", "..", "..", "public"),
    // Fallback إضافي: حتى لو فشل نسخ dist إلى public/
    // → استخدم مجلد packages/web/dist مباشرة.
    path.join(process.cwd(), "packages", "web", "dist"),
    path.join(process.cwd(), "..", "packages", "web", "dist"),
    path.resolve(__dirname, "..", "..", "packages", "web", "dist"),
    path.resolve(__dirname, "..", "..", "..", "packages", "web", "dist"),
    // Fallback أخير: مجلدات بالنسبة لوظائف Vercel من مجلد api/function
    "/tmp/public",
    "/var/task/public",
    "/var/task/packages/web/dist",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        const idx = path.join(p, "index.html");
        if (fs.existsSync(idx)) {
          return p;
        }
      }
    } catch {
      // ignore
    }
  }
  return null;
}

const staticDir = findStaticDir();
// نحفظ المسار المستخدم للـ logs وفي Runtime لتشخيص الـ fallback endpoint
const FOUND_STATIC_DIR = staticDir;

if (staticDir) {
  logger.info("serving frontend static files from: " + staticDir);
  app.use(express.static(staticDir, {
    maxAge: IS_PRODUCTION ? "1y" : 0,
    index: false,
    // Fallback لـ index.html إذا تم طلبه مباشرة
    fallthrough: true,
  }));

  const KNOWN_EXT_RE = /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml|webmanifest)$/i;

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (KNOWN_EXT_RE.test(req.path)) return next();
    // نحاول إيجاد index.html في مجلد staticDir الرئيسي أولاً
    let indexHtml = path.join(staticDir, "index.html");
    // Fallback ثانوي: إذا لم يكن موجوداً هناك → جرب كل المسارات المرشحة حتى تجد أي index.html مادي
    if (!fs.existsSync(indexHtml)) {
      const extras = [
        path.join(process.cwd(), "public", "index.html"),
        path.resolve(__dirname, "..", "..", "public", "index.html"),
        path.join(process.cwd(), "packages", "web", "dist", "index.html"),
        path.resolve(__dirname, "..", "..", "packages", "web", "dist", "index.html"),
      ];
      for (const p of extras) {
        if (fs.existsSync(p)) { indexHtml = p; break; }
      }
    }
    if (!fs.existsSync(indexHtml)) return next();
    res.sendFile(indexHtml, (err) => {
      if (err) {
        logger.warn("sendFile failed for SPA: " + (err && err.message ? err.message : String(err)));
        next(err);
      }
    });
  });
} else {
  logger.warn(
    "⚠️  لم يتم العثور على مجلد public/ للواجهة الأمامية! " +
    "لن تتم خدمة الصفحات (SPA fallback معطّل). " +
    "تأكد من نجاح مرحلة البناء (build) ووجود مجلد /public في جذر المشروع."
  );
  // Fallback طارئ أقوى: نحاول إيجاد index.html مادي في أي مكان ممكن
  // وليس مجرد صفحة refresh
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const KNOWN_EXT_RE_FALLBACK = /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml|webmanifest)$/i;
    if (KNOWN_EXT_RE_FALLBACK.test(req.path)) return next();
    // جرب كل مسارات index.html الممكنة مادياً
    const possibleIndices = [
      path.join(process.cwd(), "public", "index.html"),
      path.join(process.cwd(), "..", "public", "index.html"),
      path.resolve(__dirname, "..", "..", "public", "index.html"),
      path.resolve(__dirname, "..", "public", "index.html"),
      path.join(process.cwd(), "packages", "web", "dist", "index.html"),
      path.resolve(__dirname, "..", "..", "packages", "web", "dist", "index.html"),
    ];
    for (const idx of possibleIndices) {
      try {
        if (fs.existsSync(idx)) {
          return res.sendFile(idx, (e) => {
            if (e) next();
          });
        }
      } catch { /* ignore */ }
    }
    // آخر fallback: صفحة HTML بسيطة تشرح للمستخدم المشكلة
    res.type("html").send(
      "<!doctype html>" +
      "<html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>Golog — جاري التهيئة</title>" +
      "<meta http-equiv='refresh' content='5'></head>" +
      "<body style='font-family:system-ui;max-width:60ch;margin:4rem auto;padding:1rem;background:#fffaf2;color:#1f2937'>" +
      "<h1 style='color:#f59e0b;font-family:Reem Kufi,sans-serif'>Golog</h1>" +
      "<h2>جاري تحميل التطبيق...</h2>" +
      "<p style='opacity:.8'>إذا رأيت هذه الرسالة لأكثر من 10 ثوانٍ فهذا يعني أن عملية البناء على Vercel لم تنسخ ملفات الواجهة بعد.</p>" +
      "<p>الخطوات المقترحة:</p>" +
      "<ol><li>انتظر 30 ثانية ثم اضغط تحديث (F5)</li>" +
      "<li>إذا لم ينجح: افتح صفحة تسجيل الدخول مباشرةً: <a href='/auth'>/auth</a></li>" +
      "<li>إذا ظهر 404 مجدداً: قم بـ Redeploy من صفحة Vercel Deployments</li></ol>" +
      "</body></html>"
    );
  });
}

/* ============================================================
   معالج أخطاء عالمي (Global Error Handler)
   ------------------------------------------------------------
   هذا الميدلوير يُعالج أي استثناء لم يُعالج من قبل أي مسار أو
   ميدلوير سابق. بدلاً من أن يُرجع صفحة خطأ فارغة (500) من
   الـ Vercel أو يوجه للمستخدم إلى /auth بصمت بدون أي سبب،
   قمنا بتسجيل الخطأ في الـ Logs مع التفاصيل وإرجاع:
     • JSON خطأ مفصل لأي مسار /api/... (طلبات API)
     • إعادة توجيه إلى /auth مع ?error و ?debug لأي خطأ
       مرتبط بالمصادقة أو الجلسات (تلك التي كانت تصنعنا
       بالعودة إلى صفحة الهبوط بدون أي رسالة).
   ============================================================ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(function globalErrorHandler(err: any, req: any, res: any, _next: any) {
  const message = err?.message || String(err || "خطأ داخلي غير متوقع");
  const stack = err?.stack;
  const url = (req.originalUrl || req.url || "").toString();
  const method = (req.method || "GET").toString();

  // تسجيل الدخول في Runtime Logs
  console.error(
    `[GlobalErrorHandler] ❌ ${method} ${url}\n` +
      `  Message: ${message}\n` +
      (stack ? `  Stack: ${stack.split("\n").slice(0, 3).join("\n         ")}\n` : "")
  );

  // ----- إذا كان الطلب مسار API → أعد JSON مع وضع تفاصيل الخطأ -----
  if (url.startsWith("/api")) {
    // الحالات الخاصة التي تعني أن الجلسة فشلت:
    const isSessionRelated =
      /session|connect-pg|sessions|relation.*user_sessions|cookie|secret/i.test(message) ||
      /session|pg-simple/i.test(String(stack || ""));

    // الحالات الخاصة بمصادقة Google:
    const isOAuthRelated =
      /oauth|google|passport|state_mismatch|client_id|client_secret/i.test(message) ||
      /googleStrategy|passport.*google|oauth/i.test(String(stack || ""));

    let extraHint: string | undefined;
    if (isSessionRelated) {
      extraHint =
        "مشكلة في جدول الجلسات (user_sessions)! افتح /api/debug/session-test للتأكد ثم شغّل /api/debug/db-sync?secret=<DB_SYNC_SECRET> لإنشائه.";
    } else if (isOAuthRelated) {
      extraHint =
        "مشكلة في إعدادات Google OAuth: تأكد من GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_CALLBACK_URL في Environment Variables.";
    }

    if (res.headersSent) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    return res.status(500).json({
      error: "internal_error",
      message,
      hint: extraHint,
      debug: IS_PRODUCTION ? undefined : stack,
    });
  }

  // ----- إذا كان مسار صفحة ويب (لا يبدأ بـ /api) يحتوي خطأ -----
  // نحاول توجيهه إلى صفحة /auth مع رسالة الخطأ في query
  // حتى لا يتلقى المستخدم صفحة بيضاء فارغة 500.
  try {
    if (res.headersSent) {
      try { res.end(); } catch { /* ignore */ }
      return;
    }
    const redirectTo =
      "/auth?error=server_error&debug=" + encodeURIComponent(message.slice(0, 200));
    return res.redirect(redirectTo);
  } catch {
    try {
      if (!res.headersSent) {
        res.status(500).type("html").send(
          "<!doctype html><html><head><meta charset='utf-8'></head>" +
          "<body style='font-family:system-ui;padding:3rem'>" +
          "<h2>خطأ داخلي في الخادم</h2>" +
          "<p style='white-space:pre-wrap'>" + String(message) + "</p>" +
          "<a href='/auth'>العودة لصفحة الدخول</a>" +
          "</body></html>"
        );
      }
    } catch { /* ignore */ }
  }
});

export default app;
