import { Router } from "express";
import { db, tripsTable, usersTable, insertTripSchema } from "@golog/db";
import { and, eq, gte, lte, or, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { createNotification } from "./notifications";
import { expireStaleTrips } from "../lib/expireTrips";

const MATCH_WINDOW_MS = 12 * 60 * 60 * 1000;

const router = Router();

/**
 * يتحقق من أهلية المستخدم لنشر رحلة "نسائي وعائلي فقط":
 * - سائقة (حساب أنثى): مؤهلة تلقائياً بلا أي إجراء إضافي.
 * - سائق ذكر: غير مؤهل إطلاقاً إلا إذا فعّل الأدمن trustedForSensitiveTrips يدوياً لحسابه.
 */
function canPublishWomenFamilyTrip(user: { gender: string | null; trustedForSensitiveTrips: boolean }): boolean {
  return user.gender === "female" || user.trustedForSensitiveTrips === true;
}

// نشر عرض رحلة (سائق) أو طلب رحلة (راكب)
router.post("/trips", requireAuth, async (req, res) => {
  const parsed = insertTripSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(401).json({ error: "غير مسجّل الدخول" });

  const data = parsed.data;

  if (data.womenFamilyOnly && !canPublishWomenFamilyTrip(user)) {
    return res.status(403).json({
      error: "رحلات النسائي والعائلي متاحة فقط للسائقات، أو لسائق موثّق يدوياً من الإدارة لهذا النوع من الرحلات.",
    });
  }

  if (data.kind === "offer") {
    if (user.currentRole !== "driver") {
      return res.status(403).json({ error: "يجب التبديل لدور السائق لنشر عرض رحلة" });
    }
    (data as any).driverId = userId;
    (data as any).availableSeats = data.totalSeats;
  } else {
    (data as any).requesterId = userId;
  }

  const [trip] = await db.insert(tripsTable).values(data as any).returning();

  // إشعار أصحاب الطرف المقابل المطابق (عرض جديد يطابق طلباً قائماً، أو العكس)
  const oppositeKind = trip.kind === "offer" ? "request" : "offer";
  const matches = await db
    .select()
    .from(tripsTable)
    .where(
      and(
        eq(tripsTable.kind, oppositeKind),
        eq(tripsTable.status, "active"),
        eq(tripsTable.womenFamilyOnly, trip.womenFamilyOnly),
        sql`${tripsTable.origin} ILIKE ${"%" + trip.origin + "%"}`,
        sql`${tripsTable.destination} ILIKE ${"%" + trip.destination + "%"}`,
        gte(tripsTable.departureTime, new Date(trip.departureTime.getTime() - MATCH_WINDOW_MS)),
        lte(tripsTable.departureTime, new Date(trip.departureTime.getTime() + MATCH_WINDOW_MS)),
      ),
    );

  for (const match of matches) {
    const notifyUserId = match.kind === "offer" ? match.driverId : match.requesterId;
    if (!notifyUserId) continue;
    await createNotification({
      userId: notifyUserId,
      type: "match_found",
      title: "تطابق جديد لرحلتك",
      body: `${trip.origin} → ${trip.destination}`,
      relatedId: trip.id,
    });
  }

  res.status(201).json({ trip });
});

// بحث في الرحلات — الافتراضي "الكل"؛ فلتر women_family عبر query param ?category=women_family
router.get("/trips", async (req, res) => {
  await expireStaleTrips();
  const { city, date, category, crossingId, kind } = req.query as Record<string, string | undefined>;

  const conditions = [eq(tripsTable.status, "active")];

  if (kind === "offer" || kind === "request") {
    conditions.push(eq(tripsTable.kind, kind));
  }
  if (category === "women_family") {
    conditions.push(eq(tripsTable.womenFamilyOnly, true));
  }
  if (city) {
    conditions.push(
      or(sql`${tripsTable.origin} ILIKE ${"%" + city + "%"}`, sql`${tripsTable.destination} ILIKE ${"%" + city + "%"}`)!,
    );
  }
  if (date) {
    conditions.push(gte(tripsTable.departureTime, new Date(date)));
  }
  if (crossingId) {
    conditions.push(eq(tripsTable.crossingId, Number(crossingId)));
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

  res.json({ trips });
});

router.get("/trips/mine", requireAuth, async (req, res) => {
  await expireStaleTrips();
  const userId = (req.user as any).id;
  const trips = await db
    .select()
    .from(tripsTable)
    .where(or(eq(tripsTable.driverId, userId), eq(tripsTable.requesterId, userId)));
  res.json({ trips });
});

router.post("/trips/:id/cancel", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const tripId = Number(req.params.id);
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, tripId)).limit(1);
  if (!trip) return res.status(404).json({ error: "الرحلة غير موجودة" });
  if (trip.driverId !== userId && trip.requesterId !== userId) {
    return res.status(403).json({ error: "غير مخوّل" });
  }
  await db.update(tripsTable).set({ status: "cancelled" }).where(eq(tripsTable.id, tripId));
  res.json({ success: true });
});

export default router;
