import { pgTable, serial, text, pgEnum, timestamp } from "drizzle-orm/pg-core";

// كتالوج المدن — قابل للإدارة من لوحة التحكم
export const citiesTable = pgTable("cities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  country: text("country"), // SY / TR — لعرض العلم واختصار الفلترة
});

// كتالوج المعابر الحدودية — مع حالة حية اختيارية (مفتوح/مغلق)
export const crossingStatusEnum = pgEnum("crossing_status", ["open", "closed"]);

export const crossingsTable = pgTable("crossings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  status: crossingStatusEnum("status").notNull().default("open"),
  statusNote: text("status_note"), // ملاحظة نصية اختيارية عن سبب الإغلاق أو الازدحام
  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type City = typeof citiesTable.$inferSelect;
export type Crossing = typeof crossingsTable.$inferSelect;
