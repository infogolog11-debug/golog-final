import { Router } from "express";
import {
  db,
  usersTable,
  tripsTable,
  bookingsTable,
  parcelsTable,
  driverVerificationsTable,
  citiesTable,
  crossingsTable,
  pointTransactionsTable,
  reportsTable,
  ADMIN_PERMISSIONS,
} from "@golog/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, requireAnyAdminAccess, requirePermission } from "../middlewares/requireAuth";
import { createNotification } from "./notifications";

const router = Router();

router.use(requireAnyAdminAccess);

// --- إدارة المستخدمين ---
router.get("/admin/users", requirePermission("users"), async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json({ users });
});

router.post("/admin/users/:id/ban", requireAdmin, async (req, res) => {
  await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.post("/admin/users/:id/unban", requireAdmin, async (req, res) => {
  await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.delete("/admin/users/:id", requireAdmin, async (req, res) => {
  await db.delete(usersTable).where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

// تفعيل/إلغاء صفة "موثّق جداً للرحلات الحساسة" لسائق ذكر — بعد مراجعة خاصة صارمة
router.post("/admin/users/:id/trusted-for-sensitive-trips", requireAdmin, async (req, res) => {
  const { trusted } = req.body as { trusted: boolean };
  await db
    .update(usersTable)
    .set({ trustedForSensitiveTrips: Boolean(trusted) })
    .where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.post("/admin/users/:id/points-bonus", requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { points, note } = req.body as { points: number; note?: string };
  await db.transaction(async (tx) => {
    await tx.insert(pointTransactionsTable).values({
      userId,
      points,
      reason: points >= 0 ? "admin_bonus" : "admin_deduction",
      note,
    });
    await tx.update(usersTable).set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${points}` }).where(eq(usersTable.id, userId));
  });
  res.json({ success: true });
});

// منح/حجب صلاحيات "أدمن مساعد" — أدمن كامل (isAdmin) فقط يستطيع هذا، لأي
// مستخدم بما فيهم نفسه. لا يمكن لأدمن مساعد الوصول لهذا المسار إطلاقاً
// (يتجاوز حتى requireAnyAdminAccess العام في أعلى الملف) لمنع أي احتمال
// لمنح النفس صلاحيات أعلى.
router.post("/admin/users/:id/permissions", requireAdmin, async (req, res) => {
  const { permissions } = req.body as { permissions: string[] };
  const valid = permissions.filter((p) => (ADMIN_PERMISSIONS as readonly string[]).includes(p));
  await db
    .update(usersTable)
    .set({ adminPermissions: valid as any })
    .where(eq(usersTable.id, Number(req.params.id)));
  res.json({ success: true, permissions: valid });
});

// --- إدارة الرحلات والحجوزات والشحنات ---
router.get("/admin/trips", requirePermission("trips_bookings"), async (_req, res) => {
  const trips = await db.select().from(tripsTable);
  res.json({ trips });
});

router.post("/admin/trips/:id/cancel", requirePermission("trips_bookings"), async (req, res) => {
  await db.update(tripsTable).set({ status: "cancelled" }).where(eq(tripsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.get("/admin/bookings", requirePermission("trips_bookings"), async (_req, res) => {
  const bookings = await db.select().from(bookingsTable);
  res.json({ bookings });
});

router.post("/admin/bookings/:id/cancel", requirePermission("trips_bookings"), async (req, res) => {
  await db.update(bookingsTable).set({ status: "cancelled", cancelReason: "ألغي من قبل الإدارة" }).where(eq(bookingsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.get("/admin/parcels", requirePermission("trips_bookings"), async (_req, res) => {
  const parcels = await db.select().from(parcelsTable);
  res.json({ parcels });
});

router.post("/admin/parcels/:id/cancel", requirePermission("trips_bookings"), async (req, res) => {
  await db.update(parcelsTable).set({ status: "cancelled", cancelReason: "ألغيت من قبل الإدارة" }).where(eq(parcelsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

// --- مراجعة طلبات توثيق السائقين ---
router.get("/admin/verifications", requirePermission("verifications"), async (_req, res) => {
  const verifications = await db.select().from(driverVerificationsTable);
  res.json({ verifications });
});

router.post("/admin/verifications/:id/approve", requirePermission("verifications"), async (req, res) => {
  const [verification] = await db
    .select()
    .from(driverVerificationsTable)
    .where(eq(driverVerificationsTable.id, Number(req.params.id)))
    .limit(1);
  if (!verification) return res.status(404).json({ error: "الطلب غير موجود" });

  await db.transaction(async (tx) => {
    await tx
      .update(driverVerificationsTable)
      .set({ status: "approved", reviewedAt: new Date() })
      .where(eq(driverVerificationsTable.id, verification.id));
    await tx.update(usersTable).set({ isVerified: true }).where(eq(usersTable.id, verification.userId));
  });

  await createNotification({
    userId: verification.userId,
    type: "verification_approved",
    title: "تم توثيق حسابك",
    body: "تمت الموافقة على طلب التحقق من هويتك. شارة الموثّق ظاهرة الآن للركاب.",
  });

  res.json({ success: true });
});

router.post("/admin/verifications/:id/reject", requirePermission("verifications"), async (req, res) => {
  const { note } = req.body as { note?: string };
  const [verification] = await db
    .select()
    .from(driverVerificationsTable)
    .where(eq(driverVerificationsTable.id, Number(req.params.id)))
    .limit(1);
  if (!verification) return res.status(404).json({ error: "الطلب غير موجود" });

  await db
    .update(driverVerificationsTable)
    .set({ status: "rejected", reviewerNote: note, reviewedAt: new Date() })
    .where(eq(driverVerificationsTable.id, verification.id));

  await createNotification({
    userId: verification.userId,
    type: "verification_rejected",
    title: "لم تتم الموافقة على طلب التوثيق",
    body: note || "يرجى مراجعة الوثيقة المرفوعة وإعادة المحاولة.",
  });

  res.json({ success: true });
});

// --- تقرير الأسعار: متوسط/نطاق لكل خط سير، منفصل بين ركوب الأشخاص والشحن ---
router.get("/admin/reports/pricing", requirePermission("pricing"), async (_req, res) => {
  const tripPricing = await db
    .select({
      origin: tripsTable.origin,
      destination: tripsTable.destination,
      avgPrice: sql<number>`avg(${tripsTable.pricePerSeat})`,
      minPrice: sql<number>`min(${tripsTable.pricePerSeat})`,
      maxPrice: sql<number>`max(${tripsTable.pricePerSeat})`,
      count: sql<number>`count(*)`,
    })
    .from(tripsTable)
    .groupBy(tripsTable.origin, tripsTable.destination);

  const parcelPricing = await db
    .select({
      origin: parcelsTable.origin,
      destination: parcelsTable.destination,
      avgPrice: sql<number>`avg(${parcelsTable.price})`,
      minPrice: sql<number>`min(${parcelsTable.price})`,
      maxPrice: sql<number>`max(${parcelsTable.price})`,
      count: sql<number>`count(*)`,
    })
    .from(parcelsTable)
    .groupBy(parcelsTable.origin, parcelsTable.destination);

  res.json({ passengerPricing: tripPricing, parcelPricing });
});

// --- إدارة كتالوج المدن والمعابر ---
router.get("/admin/cities", requirePermission("catalog"), async (_req, res) => res.json({ cities: await db.select().from(citiesTable) }));
router.post("/admin/cities", requirePermission("catalog"), async (req, res) => {
  const { name, country } = req.body as { name: string; country?: string };
  const [city] = await db.insert(citiesTable).values({ name, country }).returning();
  res.status(201).json({ city });
});
router.delete("/admin/cities/:id", requirePermission("catalog"), async (req, res) => {
  await db.delete(citiesTable).where(eq(citiesTable.id, Number(req.params.id)));
  res.json({ success: true });
});

router.get("/admin/crossings", requirePermission("catalog"), async (_req, res) => res.json({ crossings: await db.select().from(crossingsTable) }));
router.post("/admin/crossings", requirePermission("catalog"), async (req, res) => {
  const { name } = req.body as { name: string };
  const [crossing] = await db.insert(crossingsTable).values({ name }).returning();
  res.status(201).json({ crossing });
});
router.patch("/admin/crossings/:id/status", requirePermission("catalog"), async (req, res) => {
  const { status, statusNote } = req.body as { status: "open" | "closed"; statusNote?: string };
  await db
    .update(crossingsTable)
    .set({ status, statusNote, statusUpdatedAt: new Date() })
    .where(eq(crossingsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

// --- مراجعة البلاغات ---
router.get("/admin/reports", requirePermission("reports"), async (_req, res) => {
  const reports = await db.select().from(reportsTable).orderBy(reportsTable.createdAt);
  res.json({ reports: reports.reverse() });
});

router.post("/admin/reports/:id/review", requirePermission("reports"), async (req, res) => {
  const { note, banReportedUser } = req.body as { note?: string; banReportedUser?: boolean };
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, Number(req.params.id))).limit(1);
  if (!report) return res.status(404).json({ error: "البلاغ غير موجود" });

  await db
    .update(reportsTable)
    .set({ status: "reviewed", reviewerNote: note, reviewedAt: new Date() })
    .where(eq(reportsTable.id, report.id));

  if (banReportedUser) {
    await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, report.reportedUserId));
  }

  res.json({ success: true });
});

router.post("/admin/reports/:id/dismiss", requirePermission("reports"), async (req, res) => {
  const { note } = req.body as { note?: string };
  await db
    .update(reportsTable)
    .set({ status: "dismissed", reviewerNote: note, reviewedAt: new Date() })
    .where(eq(reportsTable.id, Number(req.params.id)));
  res.json({ success: true });
});

export default router;
