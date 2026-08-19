import { Router } from "express";
import { db, bookingsTable, tripsTable, usersTable, insertBookingSchema } from "@golog/db";
import { eq, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth } from "../middlewares/requireAuth";
import { generateOtp } from "../lib/otp";
import { createNotification } from "./notifications";

const router = Router();

// طلب حجز مقعد على رحلة
router.post("/bookings", requireAuth, async (req, res) => {
  const parsed = insertBookingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userId = (req.user as any).id;
  const data = parsed.data;

  const seatsBooked = data.seatsBooked ?? 1;

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, data.tripId)).limit(1);
  if (!trip || trip.status !== "active") return res.status(404).json({ error: "الرحلة غير متاحة" });
  if (trip.availableSeats < seatsBooked) {
    return res.status(409).json({ error: "لا يوجد عدد كافٍ من المقاعد المتاحة" });
  }

  // قيد الأهلية لرحلات النسائي والعائلي: راكبة أنثى فقط. لا يوجد أي مسار
  // لحجز نيابة عن قاصر يسافر بمفرده — أي قاصر مرافق يسافر ضمن حجز راكبة
  // بالغة (عبر عدد المقاعد وaccompaniedMinorsCount)، فلا حاجة لاستثناء هنا.
  if (trip.womenFamilyOnly) {
    const [passenger] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (passenger?.gender !== "female") {
      return res.status(403).json({ error: "هذه الرحلة مخصصة للراكبات فقط." });
    }
  }

  const [booking] = await db
    .insert(bookingsTable)
    .values({ ...data, seatsBooked, passengerId: userId })
    .returning();

  if (trip.driverId) {
    await createNotification({
      userId: trip.driverId,
      type: "booking_requested",
      title: "طلب حجز جديد",
      body: `${trip.origin} → ${trip.destination}`,
      relatedId: booking.id,
    });
  }

  res.status(201).json({ booking });
});

// قبول الحجز من السائق: يُولَّد رمز OTP ويُنقص عدد المقاعد المتاحة
router.post("/bookings/:id/accept", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const bookingId = Number(req.params.id);

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking || booking.status !== "pending") return res.status(404).json({ error: "الحجز غير موجود" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });
  if (trip.availableSeats < booking.seatsBooked) {
    return res.status(409).json({ error: "المقاعد لم تعد متاحة" });
  }

  const otpCode = generateOtp();

  await db.transaction(async (tx) => {
    await tx.update(bookingsTable).set({ status: "confirmed", otpCode }).where(eq(bookingsTable.id, bookingId));
    const newAvailable = trip.availableSeats - booking.seatsBooked;
    await tx
      .update(tripsTable)
      .set({ availableSeats: newAvailable, status: newAvailable === 0 ? "full" : trip.status })
      .where(eq(tripsTable.id, trip.id));
  });

  await createNotification({
    userId: booking.passengerId,
    type: "booking_accepted",
    title: "تم قبول حجزك",
    body: "احتفظ برمز اللقاء لتعطيه للسائق عند الوصول",
    relatedId: booking.id,
  });

  res.json({ success: true });
});

router.post("/bookings/:id/reject", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const bookingId = Number(req.params.id);
  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking || booking.status !== "pending") return res.status(404).json({ error: "الحجز غير موجود" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });

  await db.update(bookingsTable).set({ status: "rejected" }).where(eq(bookingsTable.id, bookingId));
  await createNotification({
    userId: booking.passengerId,
    type: "booking_rejected",
    title: "تم رفض طلب حجزك",
    relatedId: booking.id,
  });
  res.json({ success: true });
});

// تأكيد اللقاء: السائق يُدخل الرمز الذي أعطاه إياه الراكب
const MAX_OTP_ATTEMPTS = 5;

// السائق يضغط "وصلت" فور اقترابه من نقطة اللقاء — إشعار فوري للراكب قبل
// حتى تبادل رمز اللقاء، يقلّل قلق الانتظار في مكان قد يكون غير مألوف
router.post("/bookings/:id/notify-arrival", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const bookingId = Number(req.params.id);

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking || booking.status !== "confirmed") return res.status(404).json({ error: "الحجز غير جاهز" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });

  await createNotification({
    userId: booking.passengerId,
    type: "driver_arrived",
    title: "السائق وصل لنقطة اللقاء",
    body: "أعطِه رمز اللقاء عند الوصول إليه",
    relatedId: booking.id,
  });

  res.json({ success: true });
});

router.post("/bookings/:id/confirm-otp", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const bookingId = Number(req.params.id);
  const { otpCode } = req.body as { otpCode: string };

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking || booking.status !== "confirmed") return res.status(404).json({ error: "الحجز غير جاهز للتأكيد" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });

  if (booking.otpAttempts >= MAX_OTP_ATTEMPTS) {
    return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات. تواصل مع الدعم أو ألغِ الحجز وأعد الحجز من جديد." });
  }

  if (booking.otpCode !== otpCode) {
    const attempts = booking.otpAttempts + 1;
    await db.update(bookingsTable).set({ otpAttempts: attempts }).where(eq(bookingsTable.id, bookingId));
    const remaining = MAX_OTP_ATTEMPTS - attempts;
    return res.status(400).json({
      error: remaining > 0 ? "رمز اللقاء غير صحيح — تبقّى " + remaining + " محاولات" : "رمز اللقاء غير صحيح — تم تجاوز الحد المسموح من المحاولات",
    });
  }

  await db
    .update(bookingsTable)
    .set({ status: "completed", otpConfirmedAt: new Date() })
    .where(eq(bookingsTable.id, bookingId));

  await createNotification({
    userId: booking.passengerId,
    type: "booking_completed",
    title: "تم تأكيد اكتمال الرحلة",
    body: "يمكنك الآن تقييم السائق",
    relatedId: booking.id,
  });

  res.json({ success: true });
});

// إلغاء حجز مع ذكر السبب — يُعيد المقعد إن كان مؤكداً
router.post("/bookings/:id/cancel", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const bookingId = Number(req.params.id);
  const { reason } = req.body as { reason?: string };

  const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, bookingId)).limit(1);
  if (!booking) return res.status(404).json({ error: "الحجز غير موجود" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
  if (!trip || (trip.driverId !== userId && booking.passengerId !== userId)) {
    return res.status(403).json({ error: "غير مخوّل" });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(bookingsTable)
      .set({ status: "cancelled", cancelReason: reason })
      .where(eq(bookingsTable.id, bookingId));

    if (booking.status === "confirmed") {
      await tx
        .update(tripsTable)
        .set({ availableSeats: trip.availableSeats + booking.seatsBooked, status: "active" })
        .where(eq(tripsTable.id, trip.id));
    }
  });

  const otherPartyId = userId === booking.passengerId ? trip.driverId : booking.passengerId;
  if (otherPartyId) {
    await createNotification({
      userId: otherPartyId,
      type: "booking_cancelled",
      title: "تم إلغاء الحجز",
      body: reason || undefined,
      relatedId: booking.id,
    });
  }

  res.json({ success: true });
});

router.get("/bookings/mine", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const rows = await db
    .select({
      booking: bookingsTable,
      trip: tripsTable,
      driverName: usersTable.name,
      driverPhone: usersTable.phone,
      driverIsVerified: usersTable.isVerified,
    })
    .from(bookingsTable)
    .innerJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
    .leftJoin(usersTable, eq(tripsTable.driverId, usersTable.id))
    .where(eq(bookingsTable.passengerId, userId));

  const bookings = rows.map((r) => ({
    ...r.booking,
    trip: { ...r.trip, driverName: r.driverName, driverPhone: r.driverPhone, driverIsVerified: r.driverIsVerified },
  }));

  res.json({ bookings });
});

// كل الحجوزات على رحلات السائق الحالي (لإدارتها: قبول/رفض/تأكيد OTP)
router.get("/bookings/for-my-trips", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const passengerAlias = alias(usersTable, "passenger");

  const rows = await db
    .select({
      booking: bookingsTable,
      trip: tripsTable,
      passengerName: passengerAlias.name,
      passengerPhone: passengerAlias.phone,
    })
    .from(bookingsTable)
    .innerJoin(tripsTable, eq(bookingsTable.tripId, tripsTable.id))
    .leftJoin(passengerAlias, eq(bookingsTable.passengerId, passengerAlias.id))
    .where(eq(tripsTable.driverId, driverId));

  const bookings = rows.map((r) => ({
    ...r.booking,
    trip: r.trip,
    passengerName: r.passengerName,
    passengerPhone: r.passengerPhone,
  }));

  res.json({ bookings });
});

export default router;
