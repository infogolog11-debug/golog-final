import { Router } from "express";
import { db, ratingsTable, bookingsTable, parcelsTable, tripsTable, pointTransactionsTable, usersTable } from "@golog/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

const POINTS_FOR_RATING = 5;

router.post("/ratings", requireAuth, async (req, res) => {
  const fromUserId = (req.user as any).id;
  const { bookingId, parcelId, rating, comment } = req.body as {
    bookingId?: number;
    parcelId?: number;
    rating: number;
    comment?: string;
  };

  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "التقييم يجب أن يكون بين 1 و5" });

  let toUserId: number | undefined;

  if (bookingId) {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking || booking.status !== "completed") return res.status(400).json({ error: "الحجز لم يكتمل بعد" });
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
    if (!trip?.driverId) return res.status(404).json({ error: "الرحلة غير موجودة" });
    if (fromUserId !== booking.passengerId && fromUserId !== trip.driverId) {
      return res.status(403).json({ error: "غير مخوّل — لست طرفاً في هذا الحجز" });
    }
    toUserId = fromUserId === booking.passengerId ? trip.driverId : booking.passengerId;
  } else if (parcelId) {
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, parcelId)).limit(1);
    if (!parcel || parcel.status !== "delivered") return res.status(400).json({ error: "الشحنة لم تُسلَّم بعد" });
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parcel.tripId!)).limit(1);
    if (!trip?.driverId) return res.status(404).json({ error: "الرحلة غير موجودة" });
    if (fromUserId !== parcel.senderId && fromUserId !== trip.driverId) {
      return res.status(403).json({ error: "غير مخوّل — لست طرفاً في هذه الشحنة" });
    }
    toUserId = fromUserId === parcel.senderId ? trip.driverId : parcel.senderId;
  } else {
    return res.status(400).json({ error: "يجب تحديد bookingId أو parcelId" });
  }

  const [created] = await db
    .insert(ratingsTable)
    .values({ fromUserId, toUserId, bookingId, parcelId, rating, comment })
    .returning()
    .onConflictDoNothing();

  if (!created) return res.status(409).json({ error: "سبق أن قيّمت هذه الرحلة/الشحنة" });

  await db.transaction(async (tx) => {
    await tx.insert(pointTransactionsTable).values({
      userId: fromUserId,
      points: POINTS_FOR_RATING,
      reason: "rating_given",
    });
    await tx
      .update(usersTable)
      .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${POINTS_FOR_RATING}` })
      .where(eq(usersTable.id, fromUserId));
  });

  res.status(201).json({ rating: created });
});

router.get("/ratings/user/:userId", async (req, res) => {
  const targetUserId = Number(req.params.userId);
  const ratings = await db.select().from(ratingsTable).where(eq(ratingsTable.toUserId, targetUserId));
  const avg =
    ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : null;
  res.json({ ratings, average: avg, count: ratings.length });
});

export default router;
