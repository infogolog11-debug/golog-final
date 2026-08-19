import crypto from "crypto";

export interface TelegramLoginPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * يتحقق من توقيع بيانات Telegram Login Widget حسب الآلية الرسمية:
 * https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLogin(data: TelegramLoginPayload): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  const { hash, ...rest } = data;
  const checkString = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${(rest as any)[k]}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(token).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  if (hmac !== hash) return false;

  // رفض بيانات دخول قديمة (أكثر من ساعة) كإجراء أمان إضافي
  const ageSec = Math.floor(Date.now() / 1000) - data.auth_date;
  if (ageSec > 3600) return false;

  return true;
}
