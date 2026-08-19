// قناة إشعار احتياطية عبر الرسائل النصية (SMS) — تُستخدم فقط للإشعارات
// الحرجة والوقت-حساسة، وفقط عندما لا يكون حساب المستخدم مرتبطاً بتيليجرام
// (القناة الأساسية المجانية). SMS له تكلفة فعلية لكل رسالة، لذا لا يُستخدم
// كقناة أساسية ولا لكل أنواع الإشعارات.
//
// يعمل عبر Twilio REST مباشرة (بدون مكتبة SDK إضافية). يبقى معطَّلاً بصمت
// (no-op) إن لم تُضبط المتغيرات — لا يكسر شيئاً في التطوير أو قبل ربط حساب
// Twilio حقيقي.

const CRITICAL_SMS_TYPES = new Set(["booking_accepted", "driver_arrived", "booking_rejected", "verification_approved", "verification_rejected"]);

export function isCriticalForSms(type: string): boolean {
  return CRITICAL_SMS_TYPES.has(type);
}

export async function sendSms(toPhone: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) return; // القناة غير مُعدَّة — تجاهل بصمت، Telegram يبقى القناة الأساسية

  try {
    const auth = Buffer.from(sid + ":" + token).toString("base64");
    await fetch("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", {
      method: "POST",
      headers: {
        Authorization: "Basic " + auth,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: toPhone, From: from, Body: message }).toString(),
    });
  } catch {
    // فشل إرسال SMS لا يجب أن يُفشل العملية الأساسية (مثل قبول حجز)
  }
}
