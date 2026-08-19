// نقطة الدخول لتشغيل الباك-إند كدالّة Vercel Serverless.
// كل الطلبات على /api/* تصل هنا (انظر vercel.json)، ويتولى Express داخلياً
// توجيهها لنفس المسارات المعروفة تماماً كما في التشغيل العادي عبر tsx.
import app from "../src/app";

export default app;
