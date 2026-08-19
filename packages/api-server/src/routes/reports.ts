import { Router } from "express";
import { db, reportsTable, bookingsTable, parcelsTable, tripsTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// إنشاء بلاغ عن مشكلة أو سلوك غير آمن — يتحقق أن المُبلِّغ طرف فعلي في
// الحجز/الشحنة قبل قبول البلاغ، ويحدّد تلقائياً من هو الطرف المُبلَّغ عنه
router.post("/reports", requireAuth, async (req, res) => {
  const reporterId = (req.user as any).id;
  const { bookingId, parcelId, reason, details } = req.body as {
    bookingId?: number;
    parcelId?: number;
    reason: string;
    details?: string;
  };

  if (!reason) return res.status(400).json({ error: "سبب البلاغ مطلوب" });

  let reportedUserId: number | undefined;

  if (bookingId) {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
    if (!booking) return res.status(404).json({ error: "الحجز غير موجود" });
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
    if (!trip?.driverId) return res.status(404).json({ error: "الرحلة غير موجودة" });
    if (reporterId !== booking.passengerId && reporterId !== trip.driverId) {
      return res.status(403).json({ error: "غير مخوّل — لست طرفاً في هذا الحجز" });
    }
    reportedUserId = reporterId === booking.passengerId ? trip.driverId : booking.passengerId;
  } else if (parcelId) {
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, parcelId)).limit(1);
    if (!parcel || !parcel.tripId) return res.status(404).json({ error: "الشحنة غير موجودة" });
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parcel.tripId)).limit(1);
    if (!trip?.driverId) return res.status(404).json({ error: "الرحلة غير موجودة" });
    if (reporterId !== parcel.senderId && reporterId !== trip.driverId) {
      return res.status(403).json({ error: "غير مخوّل — لست طرفاً في هذه الشحنة" });
    }
    reportedUserId = reporterId === parcel.senderId ? trip.driverId : parcel.senderId;
  } else {
    return res.status(400).json({ error: "يجب تحديد bookingId أو parcelId" });
  }

  const [report] = await db
    .insert(reportsTable)
    .values({ reporterId, reportedUserId, bookingId, parcelId, reason: reason as any, details })
    .returning();

  res.status(201).json({ report });
});

export default router;
