import { pgTable, serial, integer, text, timestamp, boolean, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { crossingsTable } from "./catalog";

export const tripKindEnum = pgEnum("trip_kind", ["offer", "request"]); // عرض سائق | طلب راكب
export const tripStatusEnum = pgEnum("trip_status", ["active", "full", "cancelled", "completed"]);
export const currencyEnum = pgEnum("currency", ["USD", "TRY", "SYP"]);

export const tripsTable = pgTable("trips", {
  id: serial("id").primaryKey(),
  kind: tripKindEnum("kind").notNull().default("offer"),
  driverId: integer("driver_id").references(() => usersTable.id), // مطلوب لـ offer
  requesterId: integer("requester_id").references(() => usersTable.id), // مطلوب لـ request

  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  crossingId: integer("crossing_id").references(() => crossingsTable.id),
  departureTime: timestamp("departure_time", { withTimezone: true }).notNull(),

  totalSeats: integer("total_seats").notNull(),
  availableSeats: integer("available_seats").notNull(), // يتحدّث فوراً مع كل حجز/إلغاء

  carType: text("car_type"),
  carModel: text("car_model"),
  carColor: text("car_color"),
  carPlate: text("car_plate"),

  pricePerSeat: numeric("price_per_seat", { precision: 10, scale: 2 }),
  currency: currencyEnum("currency").notNull().default("USD"),

  // رحلات نسائية وعائلية — ميزة مستقلة وواضحة، وليست فلتراً مدفوناً
  womenFamilyOnly: boolean("women_family_only").notNull().default(false),

  // خدمة شحن الطرود كامتداد للرحلة (انظر جدول parcels)
  acceptsParcels: boolean("accepts_parcels").notNull().default(false),
  maxParcelWeightKg: numeric("max_parcel_weight_kg", { precision: 5, scale: 2 }),

  status: tripStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
