import { Router } from "express";
import { db, messagesTable, bookingsTable, parcelsTable, tripsTable } from "@golog/db";
import { eq, or, and, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { objectStorage } from "../lib/objectStorage";

const router = Router();

/** يحدّد الطرف الآخر في المحادثة (السائق أو الراكب/المرسل) للتحقق من الصلاحية */
async function resolveConversationParties(
  conversationType: "booking" | "parcel",
  refId: number,
): Promise<{ partyA: number; partyB: number } | null> {
  if (conversationType === "booking") {
    const [booking] = await db.select().from(bookingsTable).where(eq(bookingsTable.id, refId)).limit(1);
    if (!booking) return null;
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, booking.tripId)).limit(1);
    if (!trip?.driverId) return null;
    return { partyA: booking.passengerId, partyB: trip.driverId };
  } else {
    const [parcel] = await db.select().from(parcelsTable).where(eq(parcelsTable.id, refId)).limit(1);
    if (!parcel || !parcel.tripId) return null;
    const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, parcel.tripId)).limit(1);
    if (!trip?.driverId) return null;
    return { partyA: parcel.senderId, partyB: trip.driverId };
  }
}

// إرسال رسالة ضمن محادثة حجز أو شحنة
router.post("/messages", requireAuth, async (req, res) => {
  const senderId = (req.user as any).id;
  const { conversationType, bookingId, parcelId, content } = req.body as {
    conversationType: "booking" | "parcel";
    bookingId?: number;
    parcelId?: number;
    content: string;
  };

  if (!content?.trim()) return res.status(400).json({ error: "لا يمكن إرسال رسالة فارغة" });

  const refId = conversationType === "booking" ? bookingId : parcelId;
  if (!refId) return res.status(400).json({ error: "معرّف المحادثة مطلوب" });

  const parties = await resolveConversationParties(conversationType, refId);
  if (!parties) return res.status(404).json({ error: "المحادثة غير موجودة" });
  if (senderId !== parties.partyA && senderId !== parties.partyB) {
    return res.status(403).json({ error: "غير مخوّل بالوصول لهذه المحادثة" });
  }

  const receiverId = senderId === parties.partyA ? parties.partyB : parties.partyA;

  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationType,
      bookingId: conversationType === "booking" ? refId : undefined,
      parcelId: conversationType === "parcel" ? refId : undefined,
      senderId,
      receiverId,
      content: content.trim(),
    })
    .returning();

  res.status(201).json({ message });
});

// جلب كل رسائل محادثة معيّنة
router.get("/messages/:conversationType/:refId", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const conversationType = req.params.conversationType as "booking" | "parcel";
  const refId = Number(req.params.refId);

  const parties = await resolveConversationParties(conversationType, refId);
  if (!parties) return res.status(404).json({ error: "المحادثة غير موجودة" });
  if (userId !== parties.partyA && userId !== parties.partyB) {
    return res.status(403).json({ error: "غير مخوّل بالوصول لهذه المحادثة" });
  }

  const idColumn = conversationType === "booking" ? messagesTable.bookingId : messagesTable.parcelId;
  const messages = await db
    .select()
    .from(messagesTable)
    .where(and(eq(messagesTable.conversationType, conversationType), eq(idColumn, refId)))
    .orderBy(asc(messagesTable.createdAt));

  // وضع علامة "مقروءة" على رسائل الطرف الآخر
  await db
    .update(messagesTable)
    .set({ readAt: new Date() })
    .where(and(eq(idColumn, refId), eq(messagesTable.receiverId, userId)));

  res.json({ messages });
});

// كل محادثات المستخدم (لعرض قائمة الرسائل)
router.get("/messages", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const messages = await db
    .select()
    .from(messagesTable)
    .where(or(eq(messagesTable.senderId, userId), eq(messagesTable.receiverId, userId)))
    .orderBy(asc(messagesTable.createdAt));
  res.json({ messages });
});

// رابط رفع مؤقت لرسالة صوتية — يتحقق أن المرسل طرف فعلي في المحادثة قبل إصداره
router.post("/messages/voice-upload-url", requireAuth, async (req, res) => {
  const userId = (req.user as any).id;
  const { conversationType, refId } = req.body as { conversationType: "booking" | "parcel"; refId: number };

  const parties = await resolveConversationParties(conversationType, refId);
  if (!parties) return res.status(404).json({ error: "المحادثة غير موجودة" });
  if (userId !== parties.partyA && userId !== parties.partyB) {
    return res.status(403).json({ error: "غير مخوّل بالوصول لهذه المحادثة" });
  }

  const { uploadUrl, objectPath } = await objectStorage.getUploadURL("voice-messages");
  res.json({ uploadUrl, objectPath });
});

// رابط استماع مؤقت لرسالة صوتية مرفوعة مسبقاً
router.get("/messages/voice-url", requireAuth, async (req, res) => {
  const { path } = req.query as { path?: string };
  if (!path) return res.status(400).json({ error: "المسار مطلوب" });
  try {
    const url = await objectStorage.getDownloadURL(path);
    res.json({ url });
  } catch {
    res.status(404).json({ error: "الملف غير موجود" });
  }
});

export default router;
