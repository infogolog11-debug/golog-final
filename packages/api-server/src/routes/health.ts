import { Router } from "express";
import { spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  PUBLIC_URL,
  GOOGLE_CLIENT_ID,
  TELEGRAM_BOT_TOKEN,
  DATABASE_URL,
  SUPABASE_PROJECT_REF,
  TWILIO_ACCOUNT_SID,
} from "../lib/env";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "golog-api",
    publicUrl: PUBLIC_URL,
    features: {
      googleOAuth: !!GOOGLE_CLIENT_ID,
      telegramBot: !!TELEGRAM_BOT_TOKEN,
      database: !!DATABASE_URL,
      objectStorage: !!SUPABASE_PROJECT_REF,
      sms: !!TWILIO_ACCOUNT_SID,
    },
  });
});

router.get("/health/env", (_req, res) => {
  res.json({
    PUBLIC_URL,
    features: {
      googleOAuth: { configured: !!GOOGLE_CLIENT_ID, callback: PUBLIC_URL + "/api/auth/google/callback" },
      telegramBot: !!TELEGRAM_BOT_TOKEN,
      database: !!DATABASE_URL,
      objectStorage: !!SUPABASE_PROJECT_REF,
      sms: !!TWILIO_ACCOUNT_SID,
    },
  });
});

/* ============================================================
   نقطة نهاية تصحيح: /api/debug/db-sync
   ------------------------------------------------------------
   غاية في الأهمية: مطابقة جداول قاعدة البيانات (Drizzle Push)
   مباشرةً عبر طلب HTTP. مفيدة إذا فشلت خطوة البناء أو إذا
   أردت إنشاء الجداول فوراً بدون إعادة نشر كامل.

   🔒 للأمان:
   1. يجب تعيين متغير البيئة DB_SYNC_SECRET في Vercel أولاً.
   2. تمرير نفس القيمة في شريط العناوين: ?secret=XXXXXXX
   3. يُسمح فقط بطلبات GET.
   ============================================================ */
router.get("/debug/db-sync", (req, res) => {
  const secretExpected = process.env.DB_SYNC_SECRET;
  if (!secretExpected) {
    return res.status(500).json({
      error: "DB_SYNC_SECRET متغير البيئة غير معروف",
      tip: "أضفه في Vercel Project Settings → Environment Variables ثم أعد النشر (Redeploy).",
    });
  }
  if (req.query.secret !== secretExpected) {
    return res.status(403).json({ error: "secret غير صحيح أو مفقود" });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: "DATABASE_URL غير معرف" });
  }
  try {
    // البحث عن مجلد db بحيث يعمل مهما كان مسار التشغيل:
    //   - محلياً عبر tsx:        packages/api-server/src/routes
    //   - على Vercel بعد Bundle: _api_bundle/ (المجلد نفسه في الجذر = packages/db موجود أيضاً)
    // نراجع قائمة مرتبة حسب الأولوية — هذه القائمة شاملة لكل السيناريوهات
    // الممكنة بما في ذلك عندما يكون cwd = /var/task أو /var/task/api
    const cwdNow = process.cwd();
    const candidates = [
      path.resolve(cwdNow, "packages", "db"),
      path.resolve(cwdNow, "..", "packages", "db"),
      path.resolve(cwdNow, "db"),
      path.resolve(cwdNow, "..", "db"),
      // احتياطي إذا كان cwd هو api (مثل /var/task/api)
      path.resolve(cwdNow, "..", "..", "packages", "db"),
      path.resolve(cwdNow, "..", "..", "db"),
      path.resolve(__dirname, "..", "..", "..", "..", "packages", "db"),
      path.resolve(__dirname, "..", "..", "..", "..", "db"),
      path.resolve(__dirname, "..", "..", "..", "db"),
      // من داخل Bundle إذا كان _api_bundle هو المجلد
      path.resolve(cwdNow, "_api_bundle", "..", "packages", "db"),
    ];

    let workDir = null as string | null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        if (fs.existsSync(path.join(c, "drizzle.config.ts")) || fs.existsSync(path.join(c, "drizzle.config.js"))) {
          workDir = c;
          break;
        }
        if (!workDir) workDir = c; // أقلّها إذا كان المجلد موجوداً ولكن الملف لم يُحَوِّل بعد
      }
    }
    if (!workDir) {
      return res.status(500).json({
        error: "تعذر تحديد موقع مجلد db/packages الذي يحتوي على drizzle.config.ts",
        candidatesChecked: candidates,
        cwd: process.cwd(),
        tip: "أضف DB_SYNC_SECRET في إعدادات Vercel، ثم تأكد من أن packages/db موجودة.",
      });
    }

    const startAt = Date.now();
    const result = spawnSync("npx", ["drizzle-kit", "push", "--config", "./drizzle.config.ts"], {
      cwd: workDir,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
      env: Object.assign({}, process.env, { CI: "true" }),
    });
    const durationMs = Date.now() - startAt;
    const stdout = result.stdout?.toString("utf-8") || "";
    const stderr = result.stderr?.toString("utf-8") || "";

    return res.json({
      ok: result.status === 0,
      exitCode: result.status,
      durationMs,
      workDir,
      stdout,
      stderr,
      tip: result.status === 0
        ? "✅ تم إنشاء/مطابقة جميع الجداول بنجاح. يمكنك الآن تسجيل الدخول عبر Google."
        : "❌ فشلت العملية؛ انظر stderr أعلاه لمعرفة السبب (غالباً مشكلة في DATABASE_URL أو صلاحيات قاعدة البيانات).",
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
      stack: process.env.NODE_ENV === "production" ? undefined : e?.stack,
    });
  }
});

/* ============================================================
   نقطة نهاية اختبار الجلسات: /api/debug/session-test
   ------------------------------------------------------------
   أسهل طريقة في العالم لمعرفة إذا كان connect-pg-simple يعمل
   فعلاً مع قاعدة البيانات (جدول user_sessions):
     1. نكتب قيمة عشوائية في req.session
     2. نحفظها (session.save — نفس الشيء الذي تستخدمه passport)
     3. نقرأها للتأكد من نجاح العملية.
   هذا الاختبار مهم جداً لأن Google OAuth تعتمد على حفظ
   الـ state داخل الجلسة قبل إعادة التوجيه إلى صفحة Google.
   ============================================================ */
router.get("/debug/session-test", (req, res) => {
  const probe = `probe_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const steps: { name: string; ok: boolean; detail?: string }[] = [];

  steps.push({
    name: "1. req.session موجود؟",
    ok: typeof req.session === "object" && req.session !== null,
    detail: typeof req.session === "object"
      ? "موجود — نوع req.session: object"
      : "مفقود — تحقق من تحميل express-session في app.ts قبل التحميل من health.ts.",
  });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req.session as any).__golog_probe = probe;
    steps.push({
      name: "2. تمت كتابة قيمة في الجلسة (memory).",
      ok: true,
      detail: "قيمة الاختبار: " + probe.slice(0, 24) + "...",
    });
  } catch (e: any) {
    steps.push({
      name: "2. فشل الكتابة في الجلسة (memory).",
      ok: false,
      detail: e?.message || String(e),
    });
    return res.status(500).json({ ok: false, steps });
  }

  req.session.save((saveErr) => {
    if (saveErr) {
      steps.push({
        name: "3. session.save() إلى PostgreSQL (خطوة الخطأ عادةً!).",
        ok: false,
        detail:
          "فشلت العملية! السبب الأغلب: جدول 'user_sessions' غير موجود أو أذونات خاطئة لـ DATABASE_URL. تفاصيل: " +
          (saveErr?.message || String(saveErr)),
      });
      return res.status(500).json({
        ok: false,
        steps,
        tip:
          "قم بتشغيل: https://<دومينك>/api/debug/db-sync?secret=<DB_SYNC_SECRET> لإنشاء جداول قاعدة البيانات تلقائياً.",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gotBack = (req.session as any).__golog_probe;
    const matched = gotBack === probe;
    steps.push({
      name: "3. session.save() إلى PostgreSQL تم بنجاح.",
      ok: matched,
      detail: matched
        ? "تم حفظ الجلسة وإرجاعها بنفس القيمة."
        : "عدم تطابق — تم استعادة قيمة خاطئة: " + String(gotBack),
    });
    return res.status(200).json({
      ok: matched,
      sessionID: req.sessionID?.slice(0, 12) + "...",
      steps,
      readyForGoogleOAuth: matched
        ? "✅ نعم — الاختبار مرّ بنجاح. الجلسات تعمل، جرب تسجيل الدخول عبر Google الآن."
        : "❌ لا — تحقق من الخطوات الأعلاه.",
    });
  });
});

export default router;
