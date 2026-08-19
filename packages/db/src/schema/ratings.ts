import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { bookingsTable } from "./bookings";
import { parcelsTable } from "./parcels";

export const ratingsTable = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    fromUserId: integer("from_user_id").notNull().references(() => usersTable.id),
    toUserId: integer("to_user_id").notNull().references(() => usersTable.id),
    bookingId: integer("booking_id").references(() => bookingsTable.id),
    parcelId: integer("parcel_id").references(() => parcelsTable.id),
    rating: integer("rating").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.fromUserId, t.toUserId, t.bookingId, t.parcelId)],
);

export type Rating = typeof ratingsTable.$inferSelect;
