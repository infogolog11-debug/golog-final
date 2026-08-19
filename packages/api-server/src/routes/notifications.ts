import { Router } from "express";
import { db, notificationsTable, usersTable } from "@golog/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendTelegram } from "../lib/telegramBot";
import { sendSms, isCriticalForSms } from "../lib/sms";

const router = Router();

/**
 * ينشئ إشعاراً داخل التطبيق، ويرسله عبر بوت تيليجرام إذا كان المستخدم قد
 * ربط حسابه (القناة الأساسية، مجانية). إن لم يكن مرتبطاً، ولدى المستخدم
 * رقم هاتف، ونوع الإشعار من الأنواع الحرجة والوقت-حساسة (قبول حجز، وصول
 * السائق، تأكيد التوثيق) — تُرسل رسالة نصية (SMS) كقناة احتياطية بدل ترك
 * المستخدم بلا أي إشعار فوري.
 */
export async function createNotification(params: {
  userId: number;
  type: (typeof notificationsTable.$inferInsert)["type"];
  title: string;
  body?: string;
  relatedId?: number;
}) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.userId)).limit(1);
  const sentViaTelegram = Boolean(user?.telegramChatId);

  await db.insert(notificationsTable).values({ ...params, sentViaTelegram });

  if (user?.telegramChatId) {
    await sendTelegram(user.telegramChatId, `<b>${params.title}</b>\n${params.body ?? ""}`);
  } else if (user?.phone && isCriticalForSms(params.type)) {
    await sendSms(user.phone, "Golog: " + params.title + (params.body ? " - " + params.body : ""));
  }
}

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt));
  res.json({ notifications });
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const notificationId = Number(req.params.id);
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.id, notificationId));
  res.json({ success: true });
});

export default router;
