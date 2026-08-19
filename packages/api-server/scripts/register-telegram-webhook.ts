// سكربت تسجيل ويبهوك بوت تيليجرام — يُشغَّل يدوياً مرة واحدة بعد كل نشر
// (وكل مرة يتغيّر فيها رابط الباك-إند). لا يُشغَّل تلقائياً من التطبيق
// نفسه لأن التنفيذ على Vercel لاخادومي (serverless) — تشغيله تلقائياً في
// كل استدعاء للدالة كان سيرسل الطلب لتيليجرام بلا داعٍ وبتكرار كبير.
//
// الاستخدام: PUBLIC_URL=https://golog-api.vercel.app TELEGRAM_BOT_TOKEN=... npx tsx scripts/register-telegram-webhook.ts

const token = process.env.TELEGRAM_BOT_TOKEN;
const publicUrl = process.env.PUBLIC_URL;

if (!token || !publicUrl) {
  console.error("يجب ضبط TELEGRAM_BOT_TOKEN و PUBLIC_URL أولاً");
  process.exit(1);
}

async function main() {
  const webhookUrl = publicUrl + "/api/telegram/webhook";
  const res = await fetch("https://api.telegram.org/bot" + token + "/setWebhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json();
  console.log("النتيجة:", data);

  const info = await fetch("https://api.telegram.org/bot" + token + "/getWebhookInfo").then((r) => r.json());
  console.log("حالة الويبهوك الحالية:", info);
}

main();
