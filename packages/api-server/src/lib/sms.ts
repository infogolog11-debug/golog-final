import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } from "./env";

const CRITICAL_SMS_TYPES = new Set([
  "booking_accepted",
  "driver_arrived",
  "booking_rejected",
  "verification_approved",
  "verification_rejected",
]);

export function isCriticalForSms(type: string): boolean {
  return CRITICAL_SMS_TYPES.has(type);
}

export async function sendSms(toPhone: string, message: string): Promise<void> {
  const sid = TWILIO_ACCOUNT_SID;
  const token = TWILIO_AUTH_TOKEN;
  const from = TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) return;

  try {
    const auth = Buffer.from(sid + ":" + token).toString("base64");
    await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + auth,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: toPhone, From: from, Body: message }).toString(),
      },
    );
  } catch {
    // فشل إرسال SMS لا يجب أن يُفشل العملية الأساسية
  }
}
