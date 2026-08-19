import { Router } from "express";
import { db, bookingsTable, tripsTable, parcelsTable } from "@golog/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// عرض وتتبع فقط لما "حصّله" السائق من الأسعار المُدخلة يدوياً — بدون أي معالجة دفع فعلية
router.get("/earnings/mine", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;

  const completedBookings = await db
    .select({ booking: bookingsTable, trip: tripsTable })
    .from(bookingsTable)
    .innerJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
    .where(and(eq(tripsTable.driverId, driverId), eq(bookingsTable.status, "completed")));

  const deliveredParcels = await db
    .select({ parcel: parcelsTable, trip: tripsTable })
    .from(parcelsTable)
    .innerJoin(tripsTable, eq(parcelsTable.tripId, tripsTable.id))
    .where(and(eq(tripsTable.driverId, driverId), eq(parcelsTable.status, "delivered")));

  const passengerEarnings = completedBookings.reduce((sum, { booking, trip }) => {
    const price = Number(trip.pricePerSeat || 0) * booking.seatsBooked;
    return sum + price;
  }, 0);

  const parcelEarnings = deliveredParcels.reduce((sum, { parcel }) => sum + Number(parcel.price || 0), 0);

  res.json({
    passengerEarnings,
    parcelEarnings,
    total: passengerEarnings + parcelEarnings,
    completedRidesCount: completedBookings.length,
    deliveredParcelsCount: deliveredParcels.length,
    note: "عرض وتتبع فقط — لا يوجد أي معالجة دفع فعلية داخل التطبيق",
  });
});

export default router;
