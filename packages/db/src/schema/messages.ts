import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { parcelsTable } from "./parcels";

// المحادثة مرتبطة بحجز رحلة أو بطلب شحنة (أحدهما فقط في كل رسالة)
export const conversationTypeEnum = pgEnum("conversation_type", ["booking", "parcel"]);

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationType: conversationTypeEnum("conversation_type").notNull(),
  bookingId: integer("booking_id").references(() => bookingsTable.id),
  parcelId: integer("parcel_id").references(() => parcelsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  receiverId: integer("receiver_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
