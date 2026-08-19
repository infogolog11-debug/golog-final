import { pgTable, serial, text, timestamp, pgEnum, boolean, integer, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// جدول المستخدمين الموحّد
// - يدعم الدخول عبر Google (googleId) أو Telegram Login Widget (telegramId)
// - لا يوجد أي حقل كلمة سر: الدخول حصراً عبر مزودين خارجيين موثوقين
// - telegramChatId منفصل عن telegramId: يُستخدم فقط لإرسال إشعارات البوت
//   بعد ربط اختياري، حتى لو سجّل المستخدم دخوله عبر Google
// ---------------------------------------------------------------------------

export const genderEnum = pgEnum("gender", ["male", "female"]);
export const roleEnum = pgEnum("role", ["driver", "passenger"]);

// صلاحيات الإدارة المساعدة (أدمن مساعد بصلاحيات محدودة) — قائمة مغلقة
// ومُتحقَّق منها في الباك-إند، وليست نصاً حراً. isAdmin=true يملك كل شيء
// دائماً بغض النظر عن هذه القائمة؛ فقط أدمن كامل (isAdmin=true) يستطيع
// تعديلها لأي مستخدم — لا يمكن لأدمن مساعد منح نفسه أو غيره صلاحيات أبداً.
export const ADMIN_PERMISSIONS = [
  "users", // حظر/رفع حظر، منح ثقة الرحلات الحساسة
  "verifications", // مراجعة توثيق السائقين
  "reports", // مراجعة البلاغات
  "trips_bookings", // إلغاء رحلات/حجوزات/شحنات
  "pricing", // عرض تقرير الأسعار
  "catalog", // إدارة المدن والمعابر
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    // هوية الدخول (واحد على الأقل مطلوب منطقياً، يُتحقق منه في طبقة التطبيق)
    googleId: text("google_id"),
    telegramId: text("telegram_id"),
    telegramUsername: text("telegram_username"),
    telegramChatId: text("telegram_chat_id"), // لإشعارات بوت تيليجرام فقط

    // بروفايل
    name: text("name").notNull(),
    email: text("email"), // قد يكون فارغاً لمن يدخل عبر تيليجرام فقط
    photoUrl: text("photo_url"),
    gender: genderEnum("gender"),
    phone: text("phone"),
    currentRole: roleEnum("current_role").notNull().default("passenger"),

    // بيانات السائق (تُملأ عند التبديل لدور سائق)
    carType: text("car_type"),
    carModel: text("car_model"),
    carColor: text("car_color"),
    carPlate: text("car_plate"),

    // ثقة وصلاحيات
    isAdmin: boolean("is_admin").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false), // شارة "موثّق" بعد مراجعة الوثيقة
    isBanned: boolean("is_banned").notNull().default(false),

    // صفة يمنحها الأدمن يدوياً فقط، بعد تحقق إضافي صارم، لتخويل سائق ذكر
    // بنشر/استقبال رحلات "نسائي وعائلي" — لا يمكن للمستخدم تفعيلها بنفسه إطلاقاً
    trustedForSensitiveTrips: boolean("trusted_for_sensitive_trips").notNull().default(false),

    // صلاحيات إدارة مساعدة محدودة — فارغة افتراضياً، لا تعني شيئاً إن كان isAdmin=true أصلاً
    adminPermissions: jsonb("admin_permissions").$type<AdminPermission[]>().notNull().default([]),

    // إقرار ذاتي عند إكمال الملف الشخصي بأن صاحب الحساب فوق 18 عاماً — لا
    // توثيق رسمي، فقط تأكيد صريح مطلوب قبل المتابعة (انظر شروط الاستخدام)
    ageConfirmedAt: timestamp("age_confirmed_at", { withTimezone: true }),

    // نقاط وإحالة
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    referralCode: text("referral_code").unique(),
    referredByUserId: integer("referred_by_user_id"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_google_id_idx").on(t.googleId),
    uniqueIndex("users_telegram_id_idx").on(t.telegramId),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
