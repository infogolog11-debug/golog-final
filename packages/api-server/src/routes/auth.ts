import { Router } from "express";
import passport from "../lib/passport";
import { db, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { verifyTelegramLogin, type TelegramLoginPayload } from "../lib/telegramAuth";
import { GOOGLE_CLIENT_ID } from "../lib/env";

const router = Router();

// --- Google OAuth ---
router.get("/auth/google", (req, res, next) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      console.error("[auth/google] ❌ GOOGLE_CLIENT_ID غير مُعرَّف في إعدادات Vercel.");
      return res.redirect(
        "/auth?error=google_missing&details=" +
          encodeURIComponent("أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Environment Variables على Vercel ثم أعد النشر.")
      );
    }
    // تسجيل تشخيصي فائق لكي نرى في Vercel Runtime Logs أين يتوقف بالضبط
    console.log("[auth/google] ✅ STEP 1/4: بداية مسار Google — الـ Session ID الحالي:", req.sessionID?.slice(0, 8) + "...");
    console.log("[auth/google] ✅ STEP 2/4: req.session موجودة؟", typeof req.session === "object" && req.session !== null);
    console.log("[auth/google] ✅ STEP 3/4: GOOGLE_CLIENT_ID مُعَرَّف =", GOOGLE_CLIENT_ID.slice(0, 8) + "...");
    console.log("[auth/google] ✅ STEP 4/4: ندعو passport.authenticate الآن — إذا توقف عند هنا → المشكلة في حفظ الـ state داخل الجلسة.");

    // مصيدة الأخطاء الحقيقية: بدلاً من أن يمرر passport الخطأ للـ global handler بصمت
    // نعالجه هنا مع تسجيل كل تفاصيله وإرجاعها للمستخدم عبر debug query
    passport.authenticate("google", { scope: ["profile", "email"] })(req, res, (wrapErr?: any) => {
      if (wrapErr) {
        console.error("[auth/google] ❌ passport.authenticate فشل في المرحلة الأولى (قبل إعادة التوجيه إلى Google):", wrapErr);
        console.error("[auth/google] ❌ stack:", wrapErr?.stack);
        const msg =
          wrapErr?.message ||
          (typeof wrapErr === "string" ? wrapErr : "خطأ غير معروف في المرحلة الأولى — راجع Vercel Runtime Logs");
        // التخمين الأكثر شيوعاً للأسباب:
        let hint = "";
        const m = (msg || "").toLowerCase();
        if (m.includes("session") || m.includes("connect-pg") || m.includes("sessions") || m.includes("relation")) {
          hint =
            " — السبب الأغلب: جدول user_sessions غير موجود! افتح https://<دومينك>/api/debug/db-sync?secret=<DB_SYNC_SECRET> لإنشائه فوراً.";
        } else if (m.includes("client_secret") || m.includes("client_id") || m.includes("oauth")) {
          hint = " — السبب الأغلب: GOOGLE_CLIENT_SECRET أو GOOGLE_CLIENT_ID ناقص أو غير صحيح.";
        }
        return res.redirect(
          "/auth?error=google_internal&debug=" + encodeURIComponent(msg + hint)
        );
      }
      // إذا وصلنا هنا بدون خطأ، يعني passport.authenticate قام بإرسال الـ redirect بنجاح (لن يُنفّذ السطر التالي)
      console.log("[auth/google] ✅ passport.authenticate انتهى — من المفترض الآن أن يتم إعادة التوجيه إلى صفحة Google.");
      next?.();
    });
  } catch (topLevelErr: any) {
    console.error("[auth/google] ❌ استثناء علوي فاشل في مسار Google:", topLevelErr);
    console.error("[auth/google] ❌ stack:", topLevelErr?.stack);
    const msg = topLevelErr?.message || String(topLevelErr || "خطأ علوي غير متوقع");
    return res.redirect(
      "/auth?error=google_crash&debug=" + encodeURIComponent(msg)
    );
  }
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    passport.authenticate("google", (err: Error | null, user: any, info: any) => {
      if (err) {
        console.error("[auth/google/callback] خطأ في المصادقة (err):", err);
        console.error("[auth/google/callback] err.stack:", err?.stack);
        const debug = encodeURIComponent(err?.message || String(err));
        return res.redirect(`/auth?error=google_internal&debug=${debug}`);
      }
      if (!user) {
        console.warn("[auth/google/callback] فشل المصادقة — info:", info);
        const why = encodeURIComponent(info?.message || (typeof info === "string" ? info : "no-details"));
        return res.redirect(`/auth?error=google_failed&info=${why}`);
      }
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("[auth/google/callback] فشل فتح الجلسة (req.login):", loginErr);
          console.error("[auth/google/callback] loginErr.stack:", loginErr?.stack);
          const debug = encodeURIComponent(loginErr?.message || String(loginErr));
          return res.redirect(`/auth?error=session_failed&debug=${debug}`);
        }
        const dest = user?.isNew ? "/complete-profile" : "/";
        return res.redirect(dest);
      });
    })(req, res, next);
  },
);

// --- Telegram Login Widget ---
router.post("/auth/telegram", async (req, res) => {
  const payload = req.body as TelegramLoginPayload;

  if (!verifyTelegramLogin(payload)) {
    return res.status(401).json({ error: "بيانات تلغرام غير صالحة" });
  }

  const telegramId = String(payload.id);
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.telegramId, telegramId))
    .limit(1);

  let user = existing[0];
  let isNew = false;

  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({
        telegramId,
        telegramUsername: payload.username,
        name: [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "مستخدم جديد",
        photoUrl: payload.photo_url,
        currentRole: "passenger",
      })
      .returning();
    user = created;
    isNew = true;
  }

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: "تعذّر فتح الجلسة" });
    return res.json({ user, isNew });
  });
});

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const uid = (req.user as any)?.id;
  if (typeof uid !== "number" || isNaN(uid)) {
    req.session?.destroy?.(() => {});
    return res.status(401).json({ error: "جلسة غير صالحة، يرجى تسجيل الدخول مجدداً" });
  }
  if ((req.user as any)?.isBanned) {
    req.logout?.() as any;
    req.session?.destroy?.(() => {});
    res.clearCookie("connect.sid");
    return res.status(403).json({ error: "هذا الحساب محظور، يرجى التواصل مع الإدارة" });
  }
  res.json({ user: req.user });
});

router.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

export default router;
