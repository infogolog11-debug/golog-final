import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { parcelsTable } from "./parcels";

// بلاغات المستخدمين — مختلفة جوهرياً عن التقييم بالنجوم: التقييم رأي، أما
// البلاغ فإنذار أمان يحتاج مراجعة إدارية فعلية وقد يستدعي إجراءً (حظر مثلاً).

export const reportReasonEnum = pgEnum("report_reason", [
  "unsafe_driving",
  "inappropriate_behavior",
  "no_show",
  "harassment",
  "fraud_or_scam",
  "other",
]);

export const reportStatusEnum = pgEnum("report_status", ["pending", "reviewed", "dismissed"]);

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  reportedUserId: integer("reported_user_id").notNull().references(() => usersTable.id),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  parcelId: integer("parcel_id").references(() => parcelsTable.id),
  reason: reportReasonEnum("reason").notNull(),
  details: text("details"),
  status: reportStatusEnum("status").notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type Report = typeof reportsTable.$inferSelect;
