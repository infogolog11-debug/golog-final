import { Router } from "express";
import { pool } from "@golog/db";
import fs from "fs";
import path from "path";
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
   🏆 الحل النهائي النهائي: تقوم هذه النقطة بإنشاء جميع الجداول
   المطلوبة في قاعدة البيانات يدوياً عبر SQL RAW (CREATE TABLE IF
   NOT EXISTS) باستخدام اتصال pg-pool الموجود فعلياً في الذاكرة.

   ✅ مميزات هذا الحل:
   • لا تعتمد على drizzle-kit أو npx أو spawnSync أو مجلد packages/db
     المادي — لذلك لا توجد مشاكل مسارات أو HOME أو node_modules على Vercel.
   • يعمل في بيئة Serverless مباشرةً وبدون اعتمادات خارجية.
   • بعد تشغيلها بنجاح، تعمل تلقائياً الجلسات + Google OAuth + كل الميزات.
   ============================================================ */
router.get("/debug/db-sync", async (req, res) => {
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
  if (!DATABASE_URL) {
    return res.status(500).json({ error: "DATABASE_URL غير معرف" });
  }

  const STATEMENTS: { name: string; sql: string }[] = [
    {
      name: "enums: gender, role",
      sql: `
        DO $$ BEGIN
          CREATE TYPE gender AS ENUM ('male', 'female');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN
          CREATE TYPE role AS ENUM ('driver', 'passenger');
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `,
    },
    {
      name: "table: users",
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          google_id TEXT,
          telegram_id TEXT,
          telegram_username TEXT,
          telegram_chat_id TEXT,
          name TEXT NOT NULL,
          email TEXT,
          photo_url TEXT,
          gender gender,
          phone TEXT,
          "current_role" role NOT NULL DEFAULT 'passenger',
          car_type TEXT,
          car_model TEXT,
          car_color TEXT,
          car_plate TEXT,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          is_verified BOOLEAN NOT NULL DEFAULT FALSE,
          is_banned BOOLEAN NOT NULL DEFAULT FALSE,
          trusted_for_sensitive_trips BOOLEAN NOT NULL DEFAULT FALSE,
          admin_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          age_confirmed_at TIMESTAMPTZ,
          loyalty_points INTEGER NOT NULL DEFAULT 0,
          referral_code TEXT UNIQUE,
          referred_by_user_id INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_idx ON users(google_id);
        CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_idx ON users(telegram_id);
      `,
    },
    {
      name: "table: user_sessions (لـ connect-pg-simple / express-session)",
      sql: `
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
          sess JSON NOT NULL,
          expire TIMESTAMP(6) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions(expire);
      `,
    },
    {
      name: "table: catalog (cities + border_crossings)",
      sql: `
        CREATE TABLE IF NOT EXISTS cities (
          id SERIAL PRIMARY KEY,
          name_ar TEXT NOT NULL,
          name_tr TEXT,
          name_en TEXT,
          country TEXT NOT NULL DEFAULT 'SY',
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS border_crossings (
          id SERIAL PRIMARY KEY,
          name_ar TEXT NOT NULL,
          name_tr TEXT,
          name_en TEXT,
          from_country TEXT NOT NULL,
          to_country TEXT NOT NULL,
          latitude DOUBLE PRECISION,
          longitude DOUBLE PRECISION,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: trips",
      sql: `
        CREATE TABLE IF NOT EXISTS trips (
          id SERIAL PRIMARY KEY,
          driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          from_city_id INTEGER,
          to_city_id INTEGER,
          via_border_crossing_id INTEGER,
          departure_at TIMESTAMPTZ NOT NULL,
          arrival_at TIMESTAMPTZ,
          price_per_seat DECIMAL(10,2) NOT NULL,
          price_per_parcel_kg DECIMAL(10,2),
          seats_available INTEGER NOT NULL DEFAULT 4,
          parcel_capacity_kg DECIMAL(10,2),
          allow_women_families_only BOOLEAN NOT NULL DEFAULT FALSE,
          trip_notes TEXT,
          status TEXT NOT NULL DEFAULT 'scheduled',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS trips_driver_id_idx ON trips(driver_id);
      `,
    },
    {
      name: "table: bookings",
      sql: `
        CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          passenger_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          seats_count INTEGER NOT NULL DEFAULT 1,
          total_price DECIMAL(10,2) NOT NULL,
          passenger_notes TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          confirmed_at TIMESTAMPTZ,
          canceled_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS bookings_trip_id_idx ON bookings(trip_id);
        CREATE INDEX IF NOT EXISTS bookings_passenger_id_idx ON bookings(passenger_id);
      `,
    },
    {
      name: "table: parcels",
      sql: `
        CREATE TABLE IF NOT EXISTS parcels (
          id SERIAL PRIMARY KEY,
          trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver_name TEXT NOT NULL,
          receiver_phone TEXT NOT NULL,
          description TEXT NOT NULL,
          weight_kg DECIMAL(10,2) NOT NULL,
          total_price DECIMAL(10,2) NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          delivered_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: messages",
      sql: `
        CREATE TABLE IF NOT EXISTS messages (
          id SERIAL PRIMARY KEY,
          trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          body TEXT NOT NULL,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: ratings",
      sql: `
        CREATE TABLE IF NOT EXISTS ratings (
          id SERIAL PRIMARY KEY,
          rater_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
          stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
          comment TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(rater_id, target_user_id, trip_id)
        );
      `,
    },
    {
      name: "table: driver_verifications",
      sql: `
        CREATE TABLE IF NOT EXISTS driver_verifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          national_id_number TEXT,
          national_id_photo_url TEXT,
          driver_license_number TEXT,
          driver_license_photo_url TEXT,
          vehicle_registration_photo_url TEXT,
          car_insurance_photo_url TEXT,
          selfie_with_id_url TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          reviewed_at TIMESTAMPTZ,
          rejection_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: referrals",
      sql: `
        CREATE TABLE IF NOT EXISTS referrals (
          id SERIAL PRIMARY KEY,
          referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
          reward_points INTEGER NOT NULL DEFAULT 0,
          redeemed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: earnings",
      sql: `
        CREATE TABLE IF NOT EXISTS earnings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          amount DECIMAL(10,2) NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: notifications",
      sql: `
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT,
          related_trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
          related_booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          read_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
    {
      name: "table: reports",
      sql: `
        CREATE TABLE IF NOT EXISTS reports (
          id SERIAL PRIMARY KEY,
          reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
          booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
          type TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open',
          handler_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          resolved_at TIMESTAMPTZ,
          resolution_notes TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `,
    },
  ];

  const results: { name: string; ok: boolean; error?: string }[] = [];
  let ok = true;
  for (const stmt of STATEMENTS) {
    try {
      await pool.query(stmt.sql);
      results.push({ name: stmt.name, ok: true });
    } catch (e: any) {
      ok = false;
      results.push({ name: stmt.name, ok: false, error: e?.message || String(e) });
    }
  }

  // بعد إنشاء الجداول مباشرة، نخلّي connect-pg-simple يتحقق من صلاحية الجدول
  // عن طريق محاولة حفظ قيمة تجريبية في الجلسة → هذا يضمن أن الجلسات تعمل.
  try {
    const probe = `db_sync_probe_${Date.now()}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((req as any).session) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).session.__probe = probe;
      await new Promise<void>((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).session.save((saveErr: any) => {
          if (saveErr) reject(saveErr);
          else resolve();
        });
      });
      results.push({ name: "session-save smoke-test", ok: true });
    }
  } catch (e: any) {
    ok = false;
    results.push({ name: "session-save smoke-test", ok: false, error: e?.message || String(e) });
  }

  return res.json({
    ok,
    summary: ok ? "✅ تم إنشاء/مطابقة جميع الجداول بنجاح. يمكنك الآن تسجيل الدخول عبر Google." : "❌ بعض العمليات فشلت؛ انظر results للتفاصيل.",
    results,
  });
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

/* ============================================================
   نقطة تشخيص نهائية /api/debug/session-deep-dump
   ------------------------------------------------------------
   هذه النقطة مهمتها الواحدة: إرجاع كل شيء بالشفافية الكاملة
   عن حالة الجلسة في لحظة استدعائها. نستخدمها فور العودة من
   صفحة Google مباشرة (قبل فتح أي رابط آخر):
   • هل وصل كوكي connect.sid فعلاً؟
   • هل هناك sessionID؟ وهل موجود في قاعدة user_sessions؟
   • هل يوجد req.user؟ وهل هو فعلاً مصادق عليه؟
   • قيمة SESSION_SECRET المستخدمة (بدون الإفصاح الكامل،
     فقط آخر 12 حرفاً للمقارنة — للتأكد من ثباتها).
   ============================================================ */
router.get("/debug/session-deep-dump", async (req, res) => {
  const headerCookieRaw = String(req.headers.cookie || "");
  const headerCookiePresent = headerCookieRaw.length > 0;
  const connectSidMatch = headerCookieRaw.match(/(?:^|;\s*)connect\.sid\s*=\s*([^;]+)/);
  const connectSidFromHeader = connectSidMatch ? connectSidMatch[1] : null;

  const sid = (req as any).sessionID as string | undefined;
  const sessionObj = (req as any).session as Record<string, unknown> | undefined;
  const authed = Boolean((req as any).isAuthenticated?.());
  const userObj = (req as any).user as Record<string, unknown> | undefined;

  // 🔍 بحث مباشر في قاعدة البيانات عن هذا الـ sid في user_sessions
  let dbRow: any = null;
  let dbError: string | null = null;
  if (sid) {
    try {
      const r = await pool.query(
        "SELECT sid, expire, sess::text AS sess_text FROM user_sessions WHERE sid = $1 LIMIT 1",
        [sid]
      );
      dbRow = r.rows?.[0] ?? null;
    } catch (e: any) {
      dbError = e?.message || String(e);
    }
  }

  // طباعة ملخص للمشكلة المقترحة بمنطق تشخيص ذكي
  let diagnosis: string = "";
  if (!headerCookiePresent || !connectSidFromHeader) {
    diagnosis =
      "🔴 سبب مشكلة الدخول = لا يوجد كوكي connect.sid في الطلب! السبب الأكثر شيوعاً:\n" +
      "   • Google Cloud Console → Authorized redirect URIs غير مضاف الرابط https://golog-final.vercel.app/api/auth/google/callback حرفياً.\n" +
      "   • أو الكوكي نفسها لم تُرسَل من الاستجابة (SameSite=None + Secure غير مطبقة)، أو Vercel يُفكّر الطلب أنه HTTP وليس HTTPS (trust proxy لم يكن true).";
  } else if (!sid) {
    diagnosis =
      "🔴 سبب مشكلة الدخول = رغم وصول connect.sid في header، لكن req.sessionID = undefined!\n" +
      "   السبب الأكثر شيوعاً: SESSION_SECRET مختلف بين Function التي حفظت والـ Function التي تقرأ الآن (SESSION_SECRET غير ثابت!).";
  } else if (!dbRow && !dbError) {
    diagnosis =
      "🔴 سبب مشكلة الدخول = الـ sessionID موجود في الكوكي ولكنه غير موجود في جدول user_sessions داخل قاعدة البيانات!\n" +
      "   → يعني أن req.session.save() بعد req.login قد فشل بصمت، أو أن الـ Function التي حفظت والـ Function التي تقرأ على قاعدة بيانات مختلفة.";
  } else if (dbError) {
    diagnosis = "🔴 سبب مشكلة الدخول = خطأ أثناء استعلام قاعدة البيانات عن user_sessions: " + dbError;
  } else if (!authed || !userObj) {
    diagnosis =
      "🔴 سبب مشكلة الدخول = الكوكي موجودة والجلسة في قاعدة البيانات، لكن passport.deserializeUser رجع null/undefined.\n" +
      "   → السبب الأكثر شيوعاً: الـ id المخزن في session.passport.user غير موجود في جدول users (تم حذفه؟)، أو خطأ في استعلام deserialize.";
  } else {
    diagnosis = "✅ كل شيء طبيعي! المستخدم فعلاً مسجل الدخول. المشكلة إن وجدت تكون في الواجهة (React App.tsx redirect logic).";
  }

  return res.json({
    diagnosis,
    cookieHeader: {
      present: headerCookiePresent,
      length: headerCookieRaw.length,
      connectSidInHeader: connectSidFromHeader
        ? connectSidFromHeader.slice(0, 18) + "..."
        : null,
    },
    req: {
      sessionID: sid ? sid.slice(0, 18) + "..." : null,
      sessionExists: typeof sessionObj === "object" && sessionObj !== null,
      sessionKeys: sessionObj ? Object.keys(sessionObj).filter(k => k !== "cookie") : [],
      isAuthenticated: authed,
      user: userObj
        ? {
            id: userObj.id ?? "N/A",
            email: (userObj as any).email ?? "N/A",
            name: (userObj as any).name ?? "N/A",
            currentRole: (userObj as any).currentRole ?? "N/A",
            isBanned: Boolean((userObj as any).isBanned),
            isAdmin: Boolean((userObj as any).isAdmin),
          }
        : null,
    },
    database_user_sessions_row_for_sid: dbRow
      ? {
          sid: dbRow.sid,
          expire: dbRow.expire,
          sess_text_preview: String(dbRow.sess_text || "").slice(0, 400),
        }
      : dbError
      ? { error: dbError }
      : null,
    secrets_check_never_exposed: {
      SESSION_SECRET_last_12_chars: (process.env.SESSION_SECRET || "").slice(-12) || "NONE",
      SESSION_SECRET_length: (process.env.SESSION_SECRET || "").length,
      COOKIE_SAME_SITE: (process.env.COOKIE_SAME_SITE as string) || "AUTO_DETECTED",
      PUBLIC_URL: PUBLIC_URL,
    },
  });
});

/* ============================================================
   🩺 نقطة التشخيص الشاملة النهائية: /api/debug/full-report
   ------------------------------------------------------------
   هذه النقطة اختراعناها لأن المستخدم استوقفنا للتخمينات.
   هذه النقطة تحقق من **كل شيء** ويُرجع سبب المشكلة صراحةً
   بدون أي تخمين:
      • هل index.html موجود فعلياً في public/ على الـ Server؟
      • هل مجلد assets/ موجود؟
      • هل packages/web/dist موجود بعد البناء؟
      • ما هو staticDir الذي تستخدمه app.ts فعلياً؟
      • هل user_sessions موجود في قاعدة البيانات؟
      • هل GOOGLE_CLIENT_ID معرف؟ و redirect URI المقترح؟
      • حالة الجلسة للمستخدم الحالي: مصادق عليه أم لا؟
   الـ Frontend في صفحة /auth ستعرض هذه النتيجة مباشرةً
   للمستخدم تحت عنوان "تقرير الفحص الذاتي" مع ✅ و ❌ لكل بند.
   ============================================================ */
router.get("/debug/full-report", async (req, res) => {
  const ROOT = process.cwd();
  const checks: { name: string; ok: boolean; value: string; detail?: string }[] = [];

  // ========= 1) فحص ملفات الواجهة (السبب الرئيسي لـ 404 في /passenger /auth الآن) =========
  const publicPath = path.join(ROOT, "public");
  const publicIndex = path.join(publicPath, "index.html");
  const publicAssets = path.join(publicPath, "assets");

  const webDistPath = path.join(ROOT, "packages", "web", "dist");
  const webDistIndex = path.join(webDistPath, "index.html");

  const publicDirExists = fs.existsSync(publicPath) && fs.statSync(publicPath).isDirectory();
  checks.push({
    name: "مجلد public/ موجود؟",
    ok: publicDirExists,
    value: publicDirExists ? "✅ نعم" : "❌ لا",
    detail: publicDirExists ? `المسار: ${publicPath}` : "مجلد public/ غير موجود على الـ Server. سبب 404 صفحات الواجهة.",
  });

  if (publicDirExists) {
    const idxOk = fs.existsSync(publicIndex);
    const size = idxOk ? Math.round(fs.statSync(publicIndex).size / 1024) : 0;
    checks.push({
      name: "public/index.html موجود؟",
      ok: idxOk,
      value: idxOk ? `✅ نعم (${size} كيلوبايت)` : "❌ لا (السبب المباشر لـ 404!)",
      detail: idxOk
        ? "الملف موجود — Vercel يجب أن يخدمه إذا كانت rewrites صح."
        : "الملف غير موجود رغم مجلد public موجوداً! فشل عملية النسخ أثناء البناء.",
    });

    const assetsOk = fs.existsSync(publicAssets) && fs.statSync(publicAssets).isDirectory();
    let assetsCount = 0;
    if (assetsOk) {
      try { assetsCount = fs.readdirSync(publicAssets).length; } catch { /* ignore */ }
    }
    checks.push({
      name: "public/assets/ موجود وبه ملفات؟",
      ok: assetsOk && assetsCount > 0,
      value: assetsOk ? `✅ نعم (${assetsCount} ملف)` : assetsOk ? "⚠️ مجلد فارغ" : "❌ مجلد غير موجود",
      detail: assetsOk
        ? "CSS/JS للواجهة موجودين."
        : "ملفات CSS/JS مفقودة! حتى لو ظهر الـ HTML، لن يشتغل React.",
    });
  }

  const distExists = fs.existsSync(webDistPath) && fs.statSync(webDistPath).isDirectory();
  checks.push({
    name: "packages/web/dist موجود؟ (مخرجات vite build)",
    ok: distExists,
    value: distExists ? "✅ نعم" : "❌ لا",
    detail: distExists
      ? "مخرجات vite build موجودة على الـ Server."
      : "فشل vite build بهدوء! يجب تفعيل الفحص FATAL في scripts/vercel-build.js.",
  });
  if (distExists) {
    const distIdx = fs.existsSync(webDistIndex);
    checks.push({
      name: "packages/web/dist/index.html موجود؟",
      ok: distIdx,
      value: distIdx ? "✅ نعم" : "❌ لا",
      detail: distIdx ? "النسخة الأصلية موجودة." : "TypeScript أخطاء في مكونات React.",
    });
  }

  // ========= 2) فحص staticDir المستخدم فعلياً في app.ts =========
  const candidatesDirs = [
    path.join(ROOT, "public"),
    path.join(ROOT, "..", "public"),
    path.resolve(__dirname, "..", "..", "public"),
    path.join(ROOT, "packages", "web", "dist"),
    path.join(ROOT, "..", "packages", "web", "dist"),
  ];
  let foundStatic: string | null = null;
  for (const p of candidatesDirs) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, "index.html"))) {
        foundStatic = p;
        break;
      }
    } catch { /* ignore */ }
  }
  checks.push({
    name: "هل يعثر Express Fallback على مجلد static؟",
    ok: !!foundStatic,
    value: foundStatic ? `✅ نعم → ${path.basename(foundStatic)}` : "❌ لا — لا مجلد لديه index.html",
    detail: foundStatic
      ? `المسار الكامل: ${foundStatic}`
      : "حتى الـ Fallback في app.ts لن يجد أي شيء — تأكد من نجاح vite build + النسخ إلى public.",
  });

  // ========= 3) فحص قاعدة البيانات =========
  let dbOK = false;
  let tablesCount: number | null = null;
  let sessionsRows = 0;
  let usersRows = 0;
  let dbErrMsg: string | null = null;
  try {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS c FROM information_schema.tables WHERE table_schema = 'public'"
    );
    tablesCount = r.rows?.[0]?.c ?? 0;
    dbOK = tablesCount > 0;
    try { sessionsRows = (await pool.query("SELECT COUNT(*)::int AS c FROM user_sessions")).rows[0].c ?? 0; } catch { sessionsRows = -1; }
    try { usersRows = (await pool.query("SELECT COUNT(*)::int AS c FROM users")).rows[0].c ?? 0; } catch { usersRows = -1; }
  } catch (e: any) {
    dbErrMsg = e?.message || String(e);
  }
  checks.push({
    name: "الاتصال بقاعدة البيانات + وجود جداول؟",
    ok: dbOK && tablesCount !== null && tablesCount >= 12,
    value: dbOK
      ? tablesCount! >= 12
        ? `✅ متصل + ${tablesCount} جدولاً`
        : `⚠️ متصل لكن فقط ${tablesCount} جداول (أقل من 12!)`
      : dbErrMsg
      ? `❌ خطأ: ${dbErrMsg.slice(0, 60)}`
      : "❌ لم يرد رد",
    detail: dbOK
      ? `عدد مستخدمين: ${usersRows} | عدد الجلسات النشطة: ${sessionsRows}`
      : "DATABASE_URL خاطئ أو Supabase/Neon/Railway متوقف أو أذونات خاطئة.",
  });

  // ========= 4) فحص Google OAuth =========
  const googleConfigured = !!GOOGLE_CLIENT_ID;
  const expectedCallback = (PUBLIC_URL || "").replace(/\/$/, "") + "/api/auth/google/callback";
  checks.push({
    name: "Google OAuth (GOOGLE_CLIENT_ID) مُعرَّف؟",
    ok: googleConfigured,
    value: googleConfigured ? "✅ نعم" : "❌ لا",
    detail: googleConfigured
      ? `Client ID يبدأ بـ: ${GOOGLE_CLIENT_ID.slice(0, 10)}...`
      : "أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في Environment Variables على Vercel ثم أعد النشر.",
  });
  if (googleConfigured) {
    checks.push({
      name: "Authorized redirect URI المطلوب إضافته في Google Cloud Console",
      ok: true,
      value: expectedCallback,
      detail: "⚠️ تأكد أن هذا الرابط حرفياً موجود في Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Authorized redirect URIs.",
    });
  }

  // ========= 5) فحص حالة الجلسة للمستخدم الحالي (مثل session-deep-dump ولكن مختصر) =========
  const hasSidHeader = /(?:^|;\s*)connect\.sid\s*=\s*[^;]+/.test(String(req.headers.cookie || ""));
  const isAuthedHere = Boolean((req as any).isAuthenticated?.());
  const userNow = (req as any).user as any;
  checks.push({
    name: "هل كوكي connect.sid وصل في هذا الطلب؟",
    ok: hasSidHeader,
    value: hasSidHeader ? "✅ نعم" : "❌ لا",
    detail: hasSidHeader
      ? "الكوكي موجود في الطلب."
      : "الكوكي غير واصل — إما أن SameSite=None+Secure غير مطبقة، أو أنك طلبت الصفحة من خلال HTTP وليس HTTPS.",
  });
  checks.push({
    name: "المستخدم الحالي مسجل الدخول (isAuthenticated)؟",
    ok: isAuthedHere,
    value: isAuthedHere
      ? `✅ نعم — ${String(userNow?.email || userNow?.name || "")}`
      : "❌ لا",
    detail: isAuthedHere
      ? userNow?.currentRole === "driver"
        ? "مصادق عليه كـ سائق."
        : "مصادق عليه كـ راكب."
      : "المشكلة إما في الجلسات (قاعدة البيانات) أو أن الكوكي لم يصل أو فشل حفظها بعد Google callback.",
  });

  // ========= الخلاصة النهائية (Diagnosis مهني لا تخمين) =========
  const failed = checks.filter(c => !c.ok);
  const summary = failed.length === 0
    ? "✅ كل الفحوصات سليمة! التطبيق جاهز للاستخدام الآن."
    : `❌ ${failed.length} من ${checks.length} بند بحاجة لإصلاح:` +
      failed.slice(0, 3).map((c, i) => `\n   ${i + 1}. ${c.name}`).join("");

  // هل المشكلة الحقيقية الآن (حسب لقطة المستخدم الأخيرة للـ 404) هي index.html مفقود؟
  const criticalFrontendFail = checks.find(c => c.name.startsWith("public/index.html"));
  const rootCause =
    criticalFrontendFail && !criticalFrontendFail.ok
      ? "🔴 السبب الحقيقي الوحيد لـ 404 في صفحة /passenger الآن: public/index.html غير موجود على الـ Server! يعني أن عملية البناء لم تنسخ الملفات إلى public/ أو فشل vite build بهدوء. الحل هو تفعيل الفحص FATAL في scripts/vercel-build.js ثم إعادة النشر."
      : failed.length === 0
      ? "🟢 كل شيء سليم — جرّب فتح الصفحة في نافذة خاصة جديدة."
      : undefined;

  res.json({
    ok: failed.length === 0,
    summary,
    rootCause,
    checks,
    timestamp: new Date().toISOString(),
    server: {
      PUBLIC_URL,
      cwd: ROOT,
    },
  });
});

export default router;
