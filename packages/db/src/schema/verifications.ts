import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const verificationStatusEnum = pgEnum("verification_status", ["pending", "approved", "rejected"]);

export const driverVerificationsTable = pgTable("driver_verifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  licenseNumber: text("license_number").notNull(),
  vehicleInfo: text("vehicle_info"),
  documentObjectPath: text("document_object_path").notNull(), // مسار الملف في التخزين المستقل (R2)
  status: verificationStatusEnum("status").notNull().default("pending"),
  reviewerNote: text("reviewer_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export type DriverVerification = typeof driverVerificationsTable.$inferSelect;
