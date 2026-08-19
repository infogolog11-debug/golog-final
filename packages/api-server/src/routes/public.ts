import { Router } from "express";
import { db, citiesTable, crossingsTable, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

// كتالوج عام — يستخدمه الجميع لملء فلاتر البحث ونماذج النشر
router.get("/cities", async (_req, res) => res.json({ cities: await db.select().from(citiesTable) }));
router.get("/crossings", async (_req, res) => res.json({ crossings: await db.select().from(crossingsTable) }));

// إكمال/تعديل الملف الشخصي بعد أول تسجيل دخول
router.patch("/users/me", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const { name, gender, phone, carType, carModel, carColor, carPlate, confirmAge } = req.body as Record<string, string | boolean>;

  const [updated] = await db
    .update(usersTable)
    .set({
      name: name as string,
      gender: gender as any,
      phone: phone as string,
      carType: carType as string,
      carModel: carModel as string,
      carColor: carColor as string,
      carPlate: carPlate as string,
      ...(confirmAge ? { ageConfirmedAt: new Date() } : {}),
    })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({ user: updated });
});

// تبديل الدور الحالي (سائق/راكب) — نفس الحساب، بدون تسجيل دخول منفصل
router.post("/users/me/switch-role", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const { role } = req.body as { role: "driver" | "passenger" };
  if (role !== "driver" && role !== "passenger") return res.status(400).json({ error: "دور غير صالح" });

  const [updated] = await db
    .update(usersTable)
    .set({ currentRole: role })
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({ user: updated });
});

// حذف الحساب الذاتي — تجهيل نهائي للبيانات الشخصية بدل حذف صفّي فعلي، حتى
// لا ينكسر سجل الرحلات والتقييمات الإحصائي للأطراف الأخرى (انظر سياسة الخصوصية)
router.delete("/users/me", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;

  await db
    .update(usersTable)
    .set({
      name: "مستخدم محذوف",
      email: null,
      phone: null,
      photoUrl: null,
      googleId: null,
      telegramId: null,
      telegramUsername: null,
      telegramChatId: null,
      carType: null,
      carModel: null,
      carColor: null,
      carPlate: null,
      isBanned: true, // يمنع تسجيل الدخول لاحقاً بنفس الحساب
    })
    .where(eq(usersTable.id, userId));

  req.logout(() => res.json({ success: true }));
});

export default router;
