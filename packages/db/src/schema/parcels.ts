import { pgTable, serial, integer, text, timestamp, pgEnum, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { tripsTable } from "./trips";
import { currencyEnum } from "./trips";

export const parcelStatusEnum = pgEnum("parcel_status", [
  "pending", // بانتظار قبول السائق
  "accepted",
  "delivered", // تم تأكيد التسليم عبر OTP
  "cancelled",
  "rejected",
]);

export const parcelsTable = pgTable("parcels", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  tripId: integer("trip_id").references(() => tripsTable.id), // الرحلة التي تُنقل الطرد ضمنها

  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  description: text("description").notNull(), // وصف موجز إلزامي للمحتوى
  weightKg: numeric("weight_kg", { precision: 5, scale: 2 }).notNull(), // فئة "خفيف" فقط، حد مقترح 5 كغ
  photoUrl: text("photo_url"),

  // المستلم لا يحتاج حساباً — بيانات نصية فقط
  receiverName: text("receiver_name").notNull(),
  receiverPhone: text("receiver_phone").notNull(),

  price: numeric("price", { precision: 10, scale: 2 }),
  currency: currencyEnum("currency").notNull().default("USD"),

  // تأكيد التسليم عبر OTP، بنفس منطق حجوزات الأشخاص
  otpCode: text("otp_code"),
  otpConfirmedAt: timestamp("otp_confirmed_at", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0),

  disclaimerAcceptedAt: timestamp("disclaimer_accepted_at", { withTimezone: true }).notNull().defaultNow(),

  status: parcelStatusEnum("status").notNull().default("pending"),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParcelSchema = createInsertSchema(parcelsTable).omit({
  id: true,
  createdAt: true,
  otpCode: true,
  otpConfirmedAt: true,
  otpAttempts: true,
});
export type InsertParcel = z.infer<typeof insertParcelSchema>;
export type Parcel = typeof parcelsTable.$inferSelect;
