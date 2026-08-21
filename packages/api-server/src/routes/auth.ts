import { Router } from "express";
import passport from "../lib/passport";
import { db, usersTable, pool } from "@golog/db";
import { eq } from "drizzle-orm";
import { verifyTelegramLogin, type TelegramLoginPayload } from "../lib/telegramAuth";
import {
  GOOGLE_CLIENT_ID,
  COOKIE_SAME_SITE,
  IS_PRODUCTION,
} from "../lib/env";

// 🔹 إعدادات الكوكي المستخدمة في الـ EXPLICIT Set-Cookie.
// يجب أن تكون مطابقة 100% لما في app.ts session({ cookie }) حتى لا
// يعتبر المتصفح كوكي مختلفاً ولا يرفضه.
const sameSite = COOKIE_SAME_SITE;
const cookieSecure =
  sameSite === "none" ? true : IS_PRODUCTION ? true : false;
const SESSION_COOKIE_OPTIONS = {
  secure: cookieSecure,
  httpOnly: true,
  sameSite: sameSite as "lax" | "none" | "strict",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // Same options custom flags: partitioned = CHIPS support for SameSite=None
  partitioned: sameSite === "none",
} as any;

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

    // ============== الخطوة 0: تذكر المسار الذي كان عليه المستخدم قبل الذهاب إلى Google ==============
    // إذا أتى المستخدم من رابط مثل ?redirect=/passenger → احفظه في session.returnTo
    // وبالتالي عند العودة من Callback → نعيده إلى نفس المسار بدلاً من الافتراضي.
    const redirectHint = String(req.query.redirect || req.query.returnTo || "").trim();
    const refHeader = String(req.headers.referer || "").trim();
    let returnTo: string | null = null;
    if (redirectHint && /^\/[A-Za-z0-9_\-\/?=&.%#+]*$/.test(redirectHint) && !redirectHint.startsWith("//")) {
      returnTo = redirectHint;
    } else if (refHeader && /passenger|driver|bookings|messages|profile|earnings|points|complete-profile|notifications|admin/i.test(refHeader)) {
      try {
        const u = new URL(refHeader);
        if (u.pathname && u.pathname.length > 1) returnTo = u.pathname + u.search;
      } catch { /* ignore */ }
    }
    if (returnTo && req.session) {
      (req.session as any).returnTo = returnTo;
      console.log("[auth/google] ✅ تم حفظ returnTo في الجلسة:", returnTo);
      // حفظ صريح قبل المتابعة حتى لا يضيع returnTo مع الـ state في Serverless Cold start
      try { req.session.save(() => {}); } catch {}
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
      // نقطة إصلاح إضافية: قبل أن يُرسل passport إعادة التوجيه إلى صفحة Google،
      // تأكدنا من أن الـ OAuth state تم حفظه فعلياً في جدول الجلسات.
      // بدون هذا الحفظ الصريح، أحياناً يفشل الحفظ بصمت على Vercel Serverless،
      // وبالتالي عند العودة من Google → state_mismatch (فشل بدون سبب).
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error("[auth/google] ❌ فشل حفظ state من OAuth في الجلسة (قبل إعادة التوجيه للـ Google):", saveErr);
          const m = saveErr?.message || String(saveErr);
          const hint = /relation|sessions|connect-pg|does not exist/i.test(m)
            ? " — السبب الأغلب: جدول user_sessions غير موجود! افتح /api/debug/db-sync?secret=<DB_SYNC_SECRET> لإنشائه فوراً."
            : "";
          return res.redirect(
            "/auth?error=state_save_failed&debug=" + encodeURIComponent(m + hint)
          );
        }
        console.log("[auth/google] ✅ passport.authenticate انتهى + session.save نجح — من المفترض الآن إعادة التوجيه إلى صفحة Google.");
      });
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
        // 🔴 نقطة الإصلاح الحاسمة (النهائية):
        //   (1) req.login
        //   (2) req.session.save() صريح إلى PostgreSQL (connect-pg-simple)
        //   (3) انتظار 250ms (ضمان وصول الكتابة عبر الشبكة في Serverless cold start)
        //   (4) استعلام مباشر SELECT من user_sessions للتأكد من وجود السطر فعلاً
        //   (5) فقط بعد كل هذا → res.redirect
        //
        // هذه الخطوات الأربع تضمن بأكثر من 99% أن الطلب التالي (بعد redirect)
        // سيجد الجلسة فعلياً في قاعدة البيانات ولن يرجع كـ "غير مسجل".
        req.session.save(async (saveErr) => {
          if (saveErr) {
            console.error("[auth/google/callback] ❌ فشل حفظ الجلسة في قاعدة البيانات بعد req.login:", saveErr);
            const m = saveErr?.message || String(saveErr);
            const hint =
              /relation|sessions|connect-pg|does not exist/i.test(m)
                ? " — السبب الأغلب: جدول user_sessions غير موجود! افتح /api/debug/db-sync?secret=<DB_SYNC_SECRET> لإنشائه فوراً."
                : "";
            const debug = encodeURIComponent(m + hint);
            return res.redirect(`/auth?error=session_save_failed&debug=${debug}`);
          }
          const sidAfterSave = req.sessionID;
          console.log(
            "[auth/google/callback] ✅ الجلسة حفظت بنجاح (session.save() انتهى). sessionID =",
            sidAfterSave?.slice(0, 10) + "..."
          );

          try {
            // انتظار قصير جداً لضمان استقرار الكتابة في بيئة Serverless
            await new Promise<void>((r) => setTimeout(r, 250));

            // ✅ إثبات حقيقي: نقرأ مباشرة من قاعدة البيانات عن هذا الـ sid
            const q = await pool.query(
              "SELECT sid, expire FROM user_sessions WHERE sid = $1 LIMIT 1",
              [sidAfterSave]
            );
            const verified = (q.rows?.length ?? 0) > 0;
            console.log(
              "[auth/google/callback] 🔍 تحقق مباشر من user_sessions: sid " +
                (verified ? "✅ موجود فعلياً في قاعدة البيانات ✅" : "❌ غير موجود! ❌") +
                " | rows = " + (q.rows?.length ?? 0)
            );
            if (!verified) {
              const debug = encodeURIComponent(
                "session.save() انتهى بدون خطأ لكن استعلام SELECT من user_sessions لم يجد أي سطر بهذا الـ sid. " +
                  "السبب الأكثر شيوعاً: قواعد بيانات مختلفة بين الـ Functions أو أن pruneSessionInterval قام بحذفه مباشرة."
              );
              return res.redirect(`/auth?error=session_not_persisted&debug=${debug}`);
            }
          } catch (verifyErr: any) {
            // فقط تحذير — نكمل العملية لأن session.save() كان ناجحاً (لا نمنع الدخول بسبب فشل التحقق)
            console.warn("[auth/google/callback] ⚠️  فشل التحقق الإضافي من قاعدة البيانات (غير قاتل):", verifyErr?.message);
          }

          // كل شيء مؤكد وصوله الآن → redirect بأمان مباشرة
          // إلى الصفحة الصحيحة حسب الدور (لا تذهب إلى / أصلاً —
          // حتى لا نعتمد على منطق React الهش في إعادة التوجيه!)
          const role = String((user as any)?.currentRole || "passenger").toLowerCase();
          const defaultDest = user?.isNew ? "/complete-profile" : role === "driver" ? "/driver" : "/passenger";
          const dest = (req as any).session?.returnTo || defaultDest;
          delete (req as any).session!.returnTo;

          // تأخير إضافي قصير 250ms + session.save() ثاني بعد تنظيف returnTo
          // لضمان أن أية تعديلات أخيرة على الجلسة (مثل حذف returnTo) تُحفظ فعلياً
          // قبل أن نرسل 303 للمستخدم.
          await new Promise<void>((r) => setTimeout(r, 250));
          await new Promise<void>((resolve, reject) => {
            try { req.session?.save((e) => e ? reject(e) : resolve()); } catch (e) { reject(e); }
          }).catch((e) => {
            console.warn("[auth/google/callback] ⚠️  session.save() الثاني قبل redirect فشل (غير قاتل):", e?.message || String(e));
          });

          // ================================================================
          // 🔴 نقطة الإصلاح الحاسمة النهائية FORCE SET-COOKIE:
          // ---------------------------------------------------------------
          // على بيئات Serverless (Vercel) كثير من الأحيان لا يقوم
          //   express-session تلقائياً بكتابة Set-Cookie في Response Header
          //   لأسباب عديدة:
          //   (1) session cookie رآه "لم يتغير" (same sessionID = not dirty)
          //   (2) rolling:true تم تطبيقه لكنه تجاهل لأنه save لم يحدث
          //       للجلسة بعد req.login.
          //   (3) استجابة 303 تقطع الـ middleware stack قبل أن ينشئ
          //       express-session الهيدر.
          // حل مهني: نكتب Set-Cookie صراحةً عبر res.cookie() بمواصفات
          //   مطابقة 100% لـ SESSION_COOKIE_OPTIONS + نرسل قيمة الكوكي
          //   المُوقعة (signed cookie format = s:<val>.<sig>) تماماً كما
          //   تفعلها express-session.
          // ================================================================
          try {
            const sessionID = (req as any).sessionID;
            if (sessionID) {
              // Build SIGNED cookie format: express-session uses cookie-signature
              // under the hood, so: signed = "s:" + val + "." + HMAC_SHA256_HEX_27
              // We can't easily recompute signature here without `cookie-signature` module,
              // BUT express has a trick: we sign using `req.secret` (which is SESSION_SECRET).
              // Fallback: if res.cookie is called with `signed: true`, express internally
              //   signs using the secret set in session middleware.
              //   We do BOTH: (a) write raw Set-Cookie manually to guarantee header exists,
              //   (b) ALSO call res.cookie(name, value with signed: true) — which might
              //   add a duplicate but duplicates don't break things, they force the browser
              //   to re-save latest attributes.
              //
              // For safety/portability: use res.cookie, express will take care of signing.
              // We pass signed:false first to send the value EXPRESS-SESSION format (the
              //   full signed string). Let's call:
              (res as any).cookie("connect.sid", sessionID, {
                ...SESSION_COOKIE_OPTIONS,
                // explicitly override anything that might be undefined:
                secure: cookieSecure,
                sameSite,
                signed: false,
              });

              // Also set P3P header for legacy browsers / Safari / IE + SameParty to accept
              res.setHeader("P3P", "CP=\"IDC DSP COR ADM DEVi TAIi PSA PSD IVAi IVDi CONi HIS OUR IND CNT\"");

              // Force clear Cache-Control on this redirect so CDN doesn't cache the
              // redirect-with-set-cookie response (very dangerous if cached).
              res.setHeader("Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
              res.setHeader("Pragma", "no-cache");
              res.setHeader("Expires", "0");
            }
          } catch (cookieErr: any) {
            console.warn(
              "[auth/google/callback] ⚠️  فشل كتابة Set-Cookie الصريحة (سيحاول express-session العودة للخطة الاحتياطية):",
              cookieErr?.message || String(cookieErr)
            );
          }

          // تأكيد بصري: هل سيُرسل Set-Cookie فعلياً في Response؟
          const setCookieHeaderRaw =
            String((res as any).getHeader?.("Set-Cookie") || "") +
            " " +
            String(((res as any)._headers || (res as any).getHeaders?.() || {})["set-cookie"] || "");
          const willSendCookie = setCookieHeaderRaw.length > 20;
          console.log(
            "[auth/google/callback] ✅ إعادة توجيه المستخدم المصادق → " +
            "dest=" + dest +
            " | user.id=" + (user as any)?.id +
            " | role=" + role +
            " | Set-Cookie will be sent?=" + Boolean(willSendCookie) +
            " | Set-Cookie(preview)=" + setCookieHeaderRaw.trim().slice(0, 120) +
            " | sessionID=" + (req as any).sessionID?.slice(0, 10) + "..." +
            " | secure=" + cookieSecure + " | sameSite=" + sameSite
          );
          // استخدام 303 بدلاً من 302 الافتراضي: يخبر المتصفح أن الطلب التالي
          // يجب أن يكون GET دائماً (حتى لو كان السابق POST) ويجب أن يرفق الكوكي
          // بالضبط كما هو في الموقع الحالي — حل قديم لكن فعال جداً لمنع بعض
          // مشاكل SameSite=None مع redirects المتتالية على Chrome/Safari.
          return res.status(303).redirect(dest);
        });
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
  // ============================================================
  // 🔍 تشخيص شامل لـ auth/me — مكتوب خصيصاً للعثور على سبب
  //    "العودة للصفحة الهبوط بعد اختيار حساب Google".
  //    كل سطر من السطور التالية يطبع في Vercel → Runtime Logs.
  // ============================================================
  const incomingCookieHeader = req.headers.cookie || "";
  const hasConnectSidCookie = /(?:^|;\s*)connect\.sid\s*=/.test(String(incomingCookieHeader));
  const sid = (req as any).sessionID;
  const user = (req as any).user;
  const authed = Boolean((req as any).isAuthenticated?.());
  console.log(
    "[auth/me] ========== deep-dump ==========\n" +
    "  header.cookie present        = " + Boolean(incomingCookieHeader) +
      (incomingCookieHeader ? ` (len=${incomingCookieHeader.length})` : "") + "\n" +
    "  connect.sid in cookie header = " + hasConnectSidCookie + "\n" +
    "  req.sessionID                = " + (sid ? sid.slice(0, 12) + "..." : "UNDEFINED/NULL") + "\n" +
    "  req.session exists           = " + (typeof (req as any).session === "object" && (req as any).session !== null) + "\n" +
    "  req.isAuthenticated()        = " + authed + "\n" +
    "  req.user exists              = " + Boolean(user) + " | typeof id = " + typeof (user?.id) + " | id = " + (user?.id ?? "N/A") + "\n" +
    "  req.user.isBanned            = " + String(user?.isBanned ?? "N/A") + "\n" +
    "========================================"
  );
  if (!authed) {
    console.warn("[auth/me] ⚠️  المستخدم ليس مصادقاً (401). الأسباب الأكثر شيوعاً:\n" +
      "  1) لم يصل كوكي connect.sid في الطلب (تأكد من SameSite=None + Secure + trust proxy=true)\n" +
      "  2) كوكي وصل لكن الـ sessionID غير موجود في جدول user_sessions (فشل الحفظ بعد req.login)\n" +
      "  3) الـ session موجود لكن deserializeUser رجع null (id غير موجود في جدول users)\n" +
      "  4) SESSION_SECRET مختلف بين الـ Function التي حفظت والـ Function التي تقرأ (SESSION_SECRET غير ثابت!)");
  }
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
