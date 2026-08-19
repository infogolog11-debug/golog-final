import { Router } from "express";
import { db, parcelsTable, tripsTable, insertParcelSchema } from "@golog/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { generateOtp } from "../lib/otp";

const router = Router();

const MAX_WEIGHT_KG = 5; // فئة "خفيف" فقط في هذه المرحلة

// قائمة الممنوعات المعروضة إلزامياً عند نشر أي طلب شحنة (للاستخدام في الواجهة الأمامية)
export const PROHIBITED_ITEMS = [
  "أموال نقدية",
  "مستندات رسمية / جوازات",
  "أدوية بدون وصفة",
  "مواد تحتاج تصريح جمركي",
  "أسلحة",
  "مواد قابلة للاشتعال",
];

router.post("/parcels", requireAuth, async (req, res) => {
  const parsed = insertParcelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const userId = (req.user as any).id;
  const data = parsed.data;

  if (Number(data.weightKg) > MAX_WEIGHT_KG) {
    return res.status(400).json({ error: `الحد الأقصى للوزن ${MAX_WEIGHT_KG} كغ في هذه المرحلة` });
  }

  if (data.tripId) {
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, data.tripId)).limit(1);
    if (!trip || !trip.acceptsParcels) {
      return res.status(400).json({ error: "هذه الرحلة لا تقبل نقل طرود" });
    }
    if (trip.maxParcelWeightKg && Number(data.weightKg) > Number(trip.maxParcelWeightKg)) {
      return res.status(400).json({ error: "الوزن يتجاوز الحد الذي يقبله السائق لهذه الرحلة" });
    }
  }

  const [parcel] = await db
    .insert(parcelsTable)
    .values({ ...data, senderId: userId, disclaimerAcceptedAt: new Date() })
    .returning();

  res.status(201).json({ parcel });
});

router.get("/parcels", async (req, res) => {
  const { city } = req.query as Record<string, string | undefined>;
  const parcels = await db.select().from(parcelsTable).where(eq(parcelsTable.status, "pending"));
  res.json({ parcels: city ? parcels.filter((p) => p.origin.includes(city) || p.destination.includes(city)) : parcels });
});

// قبول طلب شحن: يربطه السائق برحلته (إن لم يكن مرتبطاً برحلة مسبقاً) ويولّد رمز OTP
router.post("/parcels/:id/accept", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const parcelId = Number(req.params.id);
  const { tripId } = req.body as { tripId?: number };

  const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, parcelId)).limit(1);
  if (!parcel || parcel.status !== "pending") return res.status(404).json({ error: "الطرد غير متاح" });

  const targetTripId = parcel.tripId ?? tripId;
  if (!targetTripId) return res.status(400).json({ error: "يجب تحديد الرحلة التي سيُنقل الطرد ضمنها" });

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, targetTripId)).limit(1);
  if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل — هذه ليست رحلتك" });
  if (!trip.acceptsParcels) return res.status(400).json({ error: "هذه الرحلة لا تقبل نقل طرود" });

  const otpCode = generateOtp();
  await db
    .update(parcelsTable)
    .set({ status: "accepted", otpCode, tripId: targetTripId })
    .where(eq(parcelsTable.id, parcelId));

  res.json({ success: true });
});

router.post("/parcels/:id/reject", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const parcelId = Number(req.params.id);

  const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, parcelId)).limit(1);
  if (!parcel) return res.status(404).json({ error: "الطرد غير موجود" });

  if (parcel.tripId) {
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parcel.tripId)).limit(1);
    if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });
  }

  await db.update(parcelsTable).set({ status: "rejected" }).where(eq(parcelsTable.id, parcelId));
  res.json({ success: true });
});

// تأكيد التسليم: المستلم يعطي الرمز للسائق، والسائق يُدخله هنا
const MAX_PARCEL_OTP_ATTEMPTS = 5;

router.post("/parcels/:id/confirm-delivery", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const parcelId = Number(req.params.id);
  const { otpCode } = req.body as { otpCode: string };

  const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, parcelId)).limit(1);
  if (!parcel || parcel.status !== "accepted") return res.status(404).json({ error: "الطرد غير جاهز للتسليم" });

  if (parcel.tripId) {
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parcel.tripId)).limit(1);
    if (!trip || trip.driverId !== driverId) return res.status(403).json({ error: "غير مخوّل" });
  }

  if (parcel.otpAttempts >= MAX_PARCEL_OTP_ATTEMPTS) {
    return res.status(429).json({ error: "تم تجاوز الحد المسموح من المحاولات. تواصل مع الدعم." });
  }

  if (parcel.otpCode !== otpCode) {
    const attempts = parcel.otpAttempts + 1;
    await db.update(parcelsTable).set({ otpAttempts: attempts }).where(eq(parcelsTable.id, parcelId));
    const remaining = MAX_PARCEL_OTP_ATTEMPTS - attempts;
    return res.status(400).json({
      error: remaining > 0 ? "رمز التسليم غير صحيح — تبقّى " + remaining + " محاولات" : "رمز التسليم غير صحيح — تم تجاوز الحد المسموح من المحاولات",
    });
  }

  await db
    .update(parcelsTable)
    .set({ status: "delivered", otpConfirmedAt: new Date() })
    .where(eq(parcelsTable.id, parcelId));

  res.json({ success: true });
});

// الطرود التي قبلها السائق الحالي على رحلاته (لمتابعتها وتأكيد التسليم)
router.get("/parcels/mine-as-driver", requireAuth, async (req, res) => {
  const driverId = (req.user as any).id;
  const rows = await db
    .select({ parcel: parcelsTable })
    .from(parcelsTable)
    .innerJoin(tripsTable, eq(parcelsTable.tripId, tripsTable.id))
    .where(and(eq(tripsTable.driverId, driverId), sql`${parcelsTable.status} in ('accepted','delivered')`));

  res.json({ parcels: rows.map((r) => r.parcel) });
});

export default router;
