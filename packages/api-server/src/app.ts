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

app.set("trust proxy", 1);

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
const cookieSecure = sameSite === "none" ? true : IS_PRODUCTION;

const PgSession = ConnectPgSimple(session);

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
    resave: false,
    saveUninitialized: false,
    name: "connect.sid",
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      sameSite,
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
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
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        return p;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

const staticDir = findStaticDir();

if (staticDir) {
  logger.info("serving frontend static files from: " + staticDir);
  // خدمة الملفات الثابتة (assets, images, js, css, ...)
  app.use(express.static(staticDir, {
    maxAge: IS_PRODUCTION ? "1y" : 0,
    index: false, // لا تعرض index.html افتراضياً؛ نريد التحكم بالمسار بأنفسنا
  }));

  // ============================================================
  // SPA Fallback قوي: أي GET طلب (باستثناء /api/* وملفات
  // ذات امتداد ثابت معروف) → نعيد index.html
  // حتى لو فشلت قواعد rewrites في vercel.json، يضمن هذا
  // أن المستخدم لن يرى 404 أبداً.
  // ============================================================
  const KNOWN_EXT_RE = /\.(?:js|mjs|cjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf|eot|json|txt|xml|webmanifest)$/i;

  app.get("*", (req, res, next) => {
    // تجاهل أي مسار يبدأ بـ /api (يتعامل معه الـ router أعلاه)
    if (req.path.startsWith("/api")) return next();
    // تجاهل أي مسار يحتوي على امتداد ملف ثابت معروف
    if (KNOWN_EXT_RE.test(req.path)) return next();
    // كل شيء آخر → صفحة React الرئيسية (Wouter سيعالج المسار)
    const indexHtml = path.join(staticDir, "index.html");
    if (!fs.existsSync(indexHtml)) return next();
    res.sendFile(indexHtml);
  });
} else {
  logger.warn(
    "⚠️  لم يتم العثور على مجلد public/ للواجهة الأمامية! " +
    "لن تتم خدمة الصفحات (SPA fallback معطّل). " +
    "تأكد من نجاح مرحلة البناء (build) ووجود مجلد /public في جذر المشروع."
  );
  // Fallback طارئ حتى لو لم يكن هناك public: نرسل صفحة بسيطة
  // تخبر المستخدم أن البناء قد فشل أو لم يكتمل بعد.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.type("html").send(
      "<!doctype html>" +
      "<html><head><meta charset='utf-8'><meta http-equiv='refresh' content='3'></head>" +
      "<body style='font-family:system-ui;max-width:60ch;margin:4rem auto;padding:1rem'>" +
      "<h2>جاري تحميل التطبيق...</h2>" +
      "<p>إذا رأيت هذه الرسالة لأكثر من ثوانٍ، فهذا يعني أن عملية البناء لم تكتمل بعد.</p>" +
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
