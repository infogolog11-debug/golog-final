import { Router } from "express";
import { db, usersTable, referralsTable, pointTransactionsTable } from "@golog/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import crypto from "crypto";

const router = Router();

const POINTS_FOR_REFERRAL = 20;

function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// عرض/توليد رمز الإحالة الخاص بالمستخدم عند أول طلب
router.get("/referrals/my-code", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  let code = user?.referralCode;

  if (!code) {
    code = generateReferralCode();
    // إعادة المحاولة عند التعارض النادر
    for (let i = 0; i < 5; i++) {
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.referralCode, code)).limit(1);
      if (!existing) break;
      code = generateReferralCode();
    }
    await db.update(usersTable).set({ referralCode: code }).where(eq(usersTable.id, userId));
  }

  const referred = await db.select().from(referralsTable).where(eq(referralsTable.referrerId, userId));
  const bonusEarned = referred.reduce((sum, r) => sum + r.pointsAwarded, 0);

  res.json({ code, totalReferred: referred.length, bonusEarned, bonusCount: referred.length });
});

// يُستدعى عند إكمال التسجيل إذا أدخل المستخدم الجديد رمز إحالة
router.post("/referrals/apply", requireAuth, async (req, res) => {
  const newUserId = (req.user as any).id;
  const { referralCode } = req.body as { referralCode: string };

  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode)).limit(1);
  if (!referrer) return res.status(404).json({ error: "رمز الإحالة غير صحيح" });
  if (referrer.id === newUserId) return res.status(400).json({ error: "لا يمكن استخدام رمز إحالتك الخاص" });

  const [alreadyReferred] = await db
    .select()
    .from(referralsTable)
    .where(eq(referralsTable.referredId, newUserId))
    .limit(1);
  if (alreadyReferred) return res.status(409).json({ error: "تم تطبيق إحالة على هذا الحساب مسبقاً" });

  await db.transaction(async (tx) => {
    await tx.insert(referralsTable).values({
      referrerId: referrer.id,
      referredId: newUserId,
      pointsAwarded: POINTS_FOR_REFERRAL,
    });
    await tx.insert(pointTransactionsTable).values({
      userId: referrer.id,
      points: POINTS_FOR_REFERRAL,
      reason: "referral",
    });
    await tx
      .update(usersTable)
      .set({ loyaltyPoints: sql`${usersTable.loyaltyPoints} + ${POINTS_FOR_REFERRAL}`, referredByUserId: referrer.id })
      .where(eq(usersTable.id, referrer.id));
    await tx.update(usersTable).set({ referredByUserId: referrer.id }).where(eq(usersTable.id, newUserId));
  });

  res.json({ success: true, pointsAwarded: POINTS_FOR_REFERRAL });
});

router.get("/points/mine", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const transactions = await db.select().from(pointTransactionsTable).where(eq(pointTransactionsTable.userId, userId));
  res.json({ totalPoints: user?.loyaltyPoints ?? 0, transactions });
});

export default router;
