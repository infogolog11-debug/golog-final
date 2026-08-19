import { Router } from "express";
import { db, tripsTable, usersTable, parcelsTable } from "@golog/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { expireStaleTrips } from "../lib/expireTrips";

const router = Router();

const MATCH_WINDOW_HOURS = 12; // نافذة زمنية للتطابق حول موعد المغادرة المطلوب
const MATCH_WINDOW_MS = MATCH_WINDOW_HOURS * 60 * 60 * 1000;

/**
 * الشاشة الرئيسية للراكب: تعرض افتراضياً فقط عروض السائقين المطابقة لمساره
 * وتاريخه، بدل القائمة الكاملة. معايير التطابق: تقاطع المدينة/المعبر،
 * قرب التاريخ، وتوافق فئة الرحلة (عادية/نسائية) مع أهلية المستخدم.
 */
router.get("/matches/offers-for-me", requireAuth, async (req, res) => {
  await expireStaleTrips();
  const userId = (req.user as any).id;
  const { origin, destination, departAfter, all } = req.query as Record<string, string | undefined>;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const isEligibleForWomenFamily = user?.gender === "female";

  const conditions = [eq(tripsTable.kind, "offer"), eq(tripsTable.status, "active")];

  // فرض عدم إظهار رحلات النسائي والعائلي لمن ليس مؤهلاً لها إطلاقاً في المطابقة الافتراضية
  if (!isEligibleForWomenFamily) {
    conditions.push(eq(tripsTable.womenFamilyOnly, false));
  }

  if (all !== "true") {
    if (origin) conditions.push(sql`${tripsTable.origin} ILIKE ${"%" + origin + "%"}`);
    if (destination) conditions.push(sql`${tripsTable.destination} ILIKE ${"%" + destination + "%"}`);
    if (departAfter) {
      const target = new Date(departAfter);
      conditions.push(gte(tripsTable.departureTime, new Date(target.getTime() - MATCH_WINDOW_MS)));
      conditions.push(lte(tripsTable.departureTime, new Date(target.getTime() + MATCH_WINDOW_MS)));
    }
  }

  const rows = await db
    .select({
      trip: tripsTable,
      driverName: usersTable.name,
      driverPhone: usersTable.phone,
      driverPhotoUrl: usersTable.photoUrl,
      driverIsVerified: usersTable.isVerified,
      driverCompletedRides: sql<number>`(select count(*)::int from bookings b inner join trips t2 on b.trip_id = t2.id where t2.driver_id = ${usersTable.id} and b.status = 'completed')`,
    })
    .from(tripsTable)
    .leftJoin(usersTable, eq(tripsTable.driverId, usersTable.id))
    .where(and(...conditions))
    .orderBy(tripsTable.departureTime);

  const trips = rows.map((r) => ({
    ...r.trip,
    driverName: r.driverName,
    driverPhone: r.driverPhone,
    driverPhotoUrl: r.driverPhotoUrl,
    driverIsVerified: r.driverIsVerified,
    driverCompletedRides: r.driverCompletedRides,
  }));

  res.json({ trips, filtered: all !== "true" });
});

/**
 * للسائق عند نشر رحلة: يرى تلقائياً طلبات الركاب/الشحنات المطابقة لمساره
 * بدل الاضطرار للبحث يدوياً بين كل الطلبات.
 */
router.get("/matches/requests-for-trip/:tripId", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const tripId = Number(req.params.tripId);

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });

  const passengerRequests = await db
    .select()
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.kind, "request"),
        eq(tripsTable.status, "active"),
        sql`${tripsTable.origin} ILIKE ${"%" + trip.origin + "%"}`,
        sql`${tripsTable.destination} ILIKE ${"%" + trip.destination + "%"}`,
        gte(tripsTable.departureTime, new Date(trip.departureTime.getTime() - MATCH_WINDOW_MS)),
        lte(tripsTable.departureTime, new Date(trip.departureTime.getTime() + MATCH_WINDOW_MS)),
        eq(tripsTable.womenFamilyOnly, trip.womenFamilyOnly),
      ),
    );

  let parcelRequests: (typeof parcelsTable.$inferSelect)[] = [];
  if (trip.acceptsParcels) {
    const maxWeight = trip.maxParcelWeightKg ? Number(trip.maxParcelWeightKg) : 5;
    parcelRequests = await db
      .select()
      .from(parcelsTable)
      .where(
        and(
          eq(parcelsTable.status, "pending"),
          sql`${parcelsTable.origin} ILIKE ${"%" + trip.origin + "%"}`,
          sql`${parcelsTable.destination} ILIKE ${"%" + trip.destination + "%"}`,
          lte(parcelsTable.weightKg, sql`${maxWeight}`),
        ),
      );
  }

  res.json({ passengerRequests, parcelRequests });
});

export default router;
