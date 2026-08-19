import { Router } from "express";
import { db, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { sendTelegram, makeLinkCode, verifyLinkCode } from "../lib/telegramBot";

const router = Router();

// ملاحظة: هذا الربط منفصل تماماً عن تسجيل الدخول عبر Telegram Login Widget
// (routes/auth.ts) — هذا فقط لربط حساب مسجَّل مسبقاً (عبر Google مثلاً) ببوت
// الإشعارات، لمن لا يفتح التطبيق باستمرار.

router.get("/telegram/link-code", async (req, res) => {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const userId = (req.user as any).id;
  res.json({ code: makeLinkCode(userId), botUsername: process.env.TELEGRAM_BOT_USERNAME || "GologApp_bot" });
});

router.delete("/telegram/unlink", async (req, res) => {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const userId = (req.user as any).id;
  await db.update(usersTable).set({ telegramChatId: null }).where(eq(usersTable.id, userId));
  res.json({ success: true });
});

router.post("/telegram/webhook", async (req, res) => {
  res.sendStatus(200);

  const message = req.body?.message;
  if (!message) return;

  const chatId = String(message.chat?.id);
  const text: string = message.text ?? "";
  const firstName = message.from?.first_name ?? "مستخدم";

  if (text.startsWith("/start")) {
    const code = text.replace("/start", "").trim();

    if (!code) {
      await sendTelegram(
        chatId,
        `مرحباً ${firstName}! 👋\n\nهذا بوت <b>Golog</b> للإشعارات.\n\nللربط بحسابك، اذهب إلى صفحة <b>حسابي</b> في التطبيق وانقر على زر "ربط تيليجرام".`,
      );
      return;
    }

    const userId = verifyLinkCode(code);
    if (!userId) {
      await sendTelegram(chatId, "❌ رمز الربط غير صحيح أو منتهي الصلاحية.");
      return;
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) {
      await sendTelegram(chatId, "❌ المستخدم غير موجود.");
      return;
    }

    await db.update(usersTable).set({ telegramChatId: chatId }).where(eq(usersTable.id, userId));
    await sendTelegram(
      chatId,
      `✅ تم ربط حسابك بنجاح!\n\nمرحباً <b>${user.name}</b>، ستصلك الإشعارات هنا فور حدوثها.`,
    );
    return;
  }

  if (text === "/stop" || text === "/unlink") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.telegramChatId, chatId)).limit(1);
    if (user) {
      await db.update(usersTable).set({ telegramChatId: null }).where(eq(usersTable.id, user.id));
      await sendTelegram(chatId, "تم إلغاء ربط حسابك. لن تصلك إشعارات بعد الآن.");
    } else {
      await sendTelegram(chatId, "حسابك غير مرتبط أصلاً.");
    }
    return;
  }

  await sendTelegram(chatId, "مرحباً! أرسل /start للبدء.");
});

export default router;
