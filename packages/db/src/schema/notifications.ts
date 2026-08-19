import { pgTable, serial, integer, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "booking_requested",
  "booking_accepted",
  "booking_rejected",
  "booking_cancelled",
  "booking_completed",
  "parcel_requested",
  "parcel_accepted",
  "parcel_delivered",
  "new_message",
  "new_rating",
  "verification_approved",
  "verification_rejected",
  "match_found",
  "admin_bonus",
  "driver_arrived",
]);

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  relatedId: integer("related_id"), // معرّف الحجز/الشحنة/الرسالة المرتبطة
  isRead: boolean("is_read").notNull().default(false),
  sentViaTelegram: boolean("sent_via_telegram").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notificationsTable.$inferSelect;
