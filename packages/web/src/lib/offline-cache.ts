import type { Booking } from "./types";

// ---------------------------------------------------------------------------
// تخزين محلي لرمز اللقاء وبيانات الحجز الأساسية — لأن اللحظة التي يحتاج
// فيها الراكب هذا الرمز غالباً ما تكون عند نقطة حدودية بإشارة ضعيفة أو
// منعدمة. يُحفظ الرمز فور وصوله من السيرفر، ويُعرض من التخزين المحلي إن
// تعذّر الاتصال لاحقاً، بدل شاشة فارغة أو خطأ تحميل.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "golog_cached_bookings";

export interface CachedBooking {
  id: number;
  status: string;
  otpCode: string | null;
  otpConfirmedAt: string | null;
  origin: string;
  destination: string;
  departureTime: string;
  driverName: string | null;
  driverPhone: string | null;
  cachedAt: string;
}

export function cacheBookings(bookings: Booking[]) {
  try {
    const relevant: CachedBooking[] = bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .map((b) => ({
        id: b.id,
        status: b.status,
        otpCode: b.otpCode,
        otpConfirmedAt: b.otpConfirmedAt,
        origin: b.trip?.origin ?? "",
        destination: b.trip?.destination ?? "",
        departureTime: b.trip?.departureTime ?? "",
        driverName: b.trip?.driverName ?? null,
        driverPhone: b.trip?.driverPhone ?? null,
        cachedAt: new Date().toISOString(),
      }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(relevant));
  } catch {
    // التخزين المحلي قد يكون ممتلئاً أو غير متاح — لا داعي لإفشال التطبيق بسبب هذا
  }
}

export function getCachedBookings(): CachedBooking[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
