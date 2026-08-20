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
    //   - على Vercel بعد Bundle: _api_bundle/
    // نراجع قائمة مرتبة حسب الأولوية ونختار أول مجلد يحتوي على drizzle.config.ts
    const candidates = [
      // بعد الـ Bundle على Vercel: _api_bundle/ → packages/db في الجذر
      path.resolve(process.cwd(), "packages", "db"),
      // تشغيل محلي من packages/api-server
      path.resolve(__dirname, "..", "..", "..", "db"),
      // تشغيل محلي من جذر المشروع عبر ts-node أعمق
      path.resolve(__dirname, "..", "..", "..", "..", "packages", "db"),
      // احتياطي إذا كان cwd هو مجلد packages/api-server نفسه
      path.resolve(process.cwd(), "..", "db"),
    ];

    let workDir = null as string | null;
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, "drizzle.config.ts"))) {
        workDir = c;
        break;
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

export default router;
