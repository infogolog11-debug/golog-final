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
import { PUBLIC_URL } from "./lib/env";
import { pool } from "@golog/db";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set.");
}

const app: Express = express();

// السيرفر يعمل خلف بروكسي عكسي دائماً على Vercel (وأي منصة مشابهة) — هذا
// ضروري ليعمل كوكي الجلسة الآمن (secure) بشكل صحيح خلف HTTPS termination.
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

// أصل الواجهة المسموح له بالوصول مع الكوكي — لا نستخدم "اسمح لأي أصل" مطلقاً
// عندما تكون الجلسات مبنية على كوكي (credentials: true)، لأن هذا يفتح الباب
// أمام أي موقع خارجي لانتحال طلبات المستخدم المسجَّل دخوله (CSRF).
// اضبط WEB_ORIGIN على رابط الواجهة الفعلي، ويمكن فصل عدة أصول بفاصلة.
const allowedOrigins = (process.env.WEB_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

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

// حد عام لمعدّل الطلبات على كامل الـ API — طبقة حماية إضافية بجانب حدود
// المحاولات المخصصة (كـ OTP) المطبَّقة داخل كل مسار حساس على حدة.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// حد أشد خصوصاً لمسارات الدخول — يقاوم محاولات تخمين/رشّ الحسابات
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد محاولات كبير جداً، يرجى المحاولة لاحقاً" },
});
app.use("/api/auth", authLimiter);

// نمط الكوكي: "lax" يكفي عندما تكون الواجهة والباك-إند على نفس النطاق
// (أو نطاقات فرعية لنفس الدومين). إن استُضيفا على نطاقين مختلفين تماماً
// (مثال: واجهة على vercel.app وباك-إند على railway.app)، اضبط
// COOKIE_SAME_SITE=none في البيئة (يتطلب secure=true أي HTTPS إلزامياً).
const sameSite = (process.env.COOKIE_SAME_SITE as "lax" | "none" | "strict") || "lax";

const PgSession = ConnectPgSimple(session);

app.use(
  session({
    store: new PgSession({ pool, tableName: "user_sessions", createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: sameSite === "none" ? true : process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

// ---------------------------------------------------------------------------
// تقديم الواجهة الأمامية المبنية من نفس السيرفر (نشر بأصل واحد Single-Origin)
// — خيار بديل إن استضفت الباك-إند على منصة تشغّل عملية دائمة (Railway مثلاً)
// بدل Vercel. على Vercel (النشر الموصى به هنا) هذا المجلد لن يوجد أصلاً
// لأن الواجهة تُنشر كمشروع Vercel منفصل — لا ضرر من ترك الكود، فقط لن يُفعَّل.
// ---------------------------------------------------------------------------
const staticDir = path.join(import.meta.dirname, "..", "public");

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
  logger.info("serving frontend from " + staticDir);
}

export default app;
