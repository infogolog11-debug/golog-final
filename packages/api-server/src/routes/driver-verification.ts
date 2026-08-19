import { Router } from "express";
import { db, driverVerificationsTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { objectStorage } from "../lib/objectStorage";

const router = Router();

// الخطوة 1: طلب رابط رفع مؤقت من R2
router.post("/driver-verification/upload-url", requireAuth, async (_req, res) => {
  const { uploadUrl, objectPath } = await objectStorage.getUploadURL("verifications");
  res.json({ uploadUrl, objectPath });
});

// الخطوة 2: بعد رفع الملف مباشرة إلى الرابط، يُرسل السائق بيانات الطلب هنا
router.post("/driver-verification", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const { licenseNumber, vehicleInfo, documentObjectPath } = req.body as {
    licenseNumber: string;
    vehicleInfo?: string;
    documentObjectPath: string;
  };

  if (!licenseNumber || !documentObjectPath) {
    return res.status(400).json({ error: "رقم الرخصة ومسار الوثيقة مطلوبان" });
  }

  const [existing] = await db
    .select()
    .from(driverVerificationsTable)
    .where(eq(driverVerificationsTable.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(driverVerificationsTable)
      .set({ licenseNumber, vehicleInfo, documentObjectPath, status: "pending", submittedAt: new Date(), reviewedAt: null })
      .where(eq(driverVerificationsTable.userId, userId))
      .returning();
    return res.json({ verification: updated });
  }

  const [created] = await db
    .insert(driverVerificationsTable)
    .values({ userId, licenseNumber, vehicleInfo, documentObjectPath })
    .returning();

  res.status(201).json({ verification: created });
});

router.get("/driver-verification/mine", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const [verification] = await db
    .select()
    .from(driverVerificationsTable)
    .where(eq(driverVerificationsTable.userId, userId))
    .limit(1);
  res.json({ verification: verification || null });
});

export default router;
