import crypto from "crypto";

function makeLinkCode(userId: number): string {
  const secret = process.env.SESSION_SECRET ?? "fallback";
  const sig = crypto.createHmac("sha256", secret).update(String(userId)).digest("hex").slice(0, 16);
  return `${userId}_${sig}`;
}

function verifyLinkCode(code: string): number | null {
  const parts = code.split("_");
  if (parts.length !== 2) return null;
  const userId = parseInt(parts[0]);
  if (isNaN(userId)) return null;
  return makeLinkCode(userId) === code ? userId : null;
}

export async function sendTelegram(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

export { makeLinkCode, verifyLinkCode };
