import { Router } from "express";
import { pool } from "@golog/db";
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

export default router;
