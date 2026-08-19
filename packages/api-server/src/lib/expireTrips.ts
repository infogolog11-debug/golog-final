import { db, tripsTable } from "@golog/db";
import { and, eq, lt, sql } from "drizzle-orm";

// انتهاء صلاحية الرحلات تلقائياً — بدل أن تبقى رحلة انتهى وقتها منذ
// ساعات ظاهرة في نتائج البحث وكأنها متاحة، مما يُحبط راكباً يحجز رحلة
// لم تعد قائمة. يُستدعى بأسلوب "تحديث كسول عند القراءة" (lazy expiration)
// بدل الاعتماد على مهمة مجدولة منفصلة — أبسط ويكفي تماماً لحجم هذا التطبيق.
//
// هامش الأمان 12 ساعة بعد موعد الانطلاق (لا فوراً) لأن رحلات عبور الحدود
// قد تستغرق ساعات طويلة فعلياً ولا يجب اعتبارها "منتهية" وهي لا تزال جارية.
const GRACE_HOURS = 12;

export async function expireStaleTrips(): Promise<void> {
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);
  await db
    .update(tripsTable)
    .set({ status: "completed" })
    .where(and(eq(tripsTable.status, "active"), lt(tripsTable.departureTime, cutoff)));
}
