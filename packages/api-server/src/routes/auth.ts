import { Router } from "express";
import passport from "../lib/passport";
import { db, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { verifyTelegramLogin, type TelegramLoginPayload } from "../lib/telegramAuth";

const router = Router();

// --- Google OAuth ---
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=google" }),
  (req, res) => {
    const user = req.user as any;
    const dest = user?.isNew ? "/complete-profile" : "/";
    res.redirect(dest);
  },
);

// --- Telegram Login Widget ---
// الواجهة الأمامية تستقبل بيانات الويدجت وترسلها هنا للتحقق وفتح الجلسة
router.post("/auth/telegram", async (req, res) => {
  const payload = req.body as TelegramLoginPayload;

  if (!verifyTelegramLogin(payload)) {
    return res.status(401).json({ error: "بيانات تلغرام غير صالحة" });
  }

  const telegramId = String(payload.id);
  const existing = await db.select().from(usersTable).where(eq(usersTable.telegramId, telegramId)).limit(1);

  let user = existing[0];
  let isNew = false;

  if (!user) {
    const [created] = await db
      .insert(usersTable)
      .values({
        telegramId,
        telegramUsername: payload.username,
        name: [payload.first_name, payload.last_name].filter(Boolean).join(" ") || "مستخدم جديد",
        photoUrl: payload.photo_url,
        currentRole: "passenger",
      })
      .returning();
    user = created;
    isNew = true;
  }

  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: "تعذّر فتح الجلسة" });
    return res.json({ user, isNew });
  });
});

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  res.json({ user: req.user });
});

router.post("/auth/logout", (req, res) => {
  req.logout(() => res.json({ success: true }));
});

export default router;
