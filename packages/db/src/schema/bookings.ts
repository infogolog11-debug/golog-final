import { pgTable, serial, integer, timestamp, pgEnum, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { tripsTable } from "./trips";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending", // بانتظار قبول السائق
  "confirmed", // قبِلها السائق
  "completed", // تم تأكيد اللقاء عبر OTP
  "cancelled",
  "rejected",
]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull().references(() => tripsTable.id),
  passengerId: integer("passenger_id").notNull().references(() => usersTable.id),
  seatsBooked: integer("seats_booked").notNull().default(1),
  status: bookingStatusEnum("status").notNull().default("pending"),

  // تأكيد اللقاء عبر رمز OTP من 4 أرقام
  otpCode: text("otp_code"), // رمز اللقاء (يُعطيه الراكب البالغ للسائق)
  otpConfirmedAt: timestamp("otp_confirmed_at", { withTimezone: true }),
  otpAttempts: integer("otp_attempts").notNull().default(0), // حماية من تخمين الرمز العشوائي

  // سياسة صارمة: لا يُقبل أي حجز أو عبور لقاصر إلا برفقة فعلية من أحد الأبوين
  // أو وصي شرعي على متن الرحلة نفسها (لا يوجد أي مسار لإرسال قاصر بمفرده).
  // العدد أدناه معلوماتي فقط لسياق السائق — لا يُنشئ أي آلية تأكيد منفصلة،
  // لأن الوصي المرافق هو من يستخدم رمز اللقاء نفسه أعلاه.
  accompaniedMinorsCount: integer("accompanied_minors_count").notNull().default(0),

  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  otpCode: true,
  otpConfirmedAt: true,
  otpAttempts: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
