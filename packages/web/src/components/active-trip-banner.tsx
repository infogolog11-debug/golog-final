import { useLocation } from "wouter";
import { useGetMe, useMyBookings } from "@/lib/queries";
import { RouteLine } from "./route-line";
import { getCachedBookings } from "@/lib/offline-cache";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { WifiOff } from "lucide-react";

/**
 * شريط ثابت يذكّر الراكب برحلته القادمة المؤكَّدة أينما تنقّل في التطبيق —
 * بدل أن يُضطر للعودة يدوياً لتبويب "حجوزاتي" ليتذكر أن لديه رحلة قريبة.
 * يعتمد على التخزين المحلي (نفس تخزين رمز اللقاء) عند انقطاع الاتصال، بدل
 * الاختفاء بصمت في اللحظة التي يكون فيها أكثر أهمية.
 */
export function ActiveTripBanner() {
  const { data: user } = useGetMe();
  const { data: bookings, isError } = useMyBookings();
  const [, setLocation] = useLocation();

  if (!user || user.currentRole !== "passenger") return null;

  const offline = isError && !bookings;

  if (offline) {
    const cached = getCachedBookings().filter((b) => b.status === "confirmed" && b.departureTime && new Date(b.departureTime) > new Date());
    const upcoming = cached.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())[0];
    if (!upcoming) return null;

    return (
      <button
        onClick={() => setLocation("/bookings")}
        className="w-full bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-amber-800"
      >
        <WifiOff className="w-3.5 h-3.5 shrink-0" />
        <span>رحلتك القادمة (محفوظة محلياً):</span>
        <span>{upcoming.origin}</span>
        <RouteLine className="h-2.5 w-8" />
        <span>{upcoming.destination}</span>
      </button>
    );
  }

  if (!bookings) return null;

  const upcoming = bookings
    .filter((b) => b.status === "confirmed" && b.trip && new Date(b.trip.departureTime) > new Date())
    .sort((a, b) => new Date(a.trip!.departureTime).getTime() - new Date(b.trip!.departureTime).getTime())[0];

  if (!upcoming || !upcoming.trip) return null;

  return (
    <button
      onClick={() => setLocation("/bookings")}
      className="w-full bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-center gap-2 text-xs sm:text-sm font-medium text-primary"
    >
      <span>رحلتك القادمة:</span>
      <span>{upcoming.trip.origin}</span>
      <RouteLine className="h-2.5 w-8" />
      <span>{upcoming.trip.destination}</span>
      <span className="text-primary/70">
        · بعد {formatDistanceToNowStrict(new Date(upcoming.trip.departureTime), { locale: ar })}
      </span>
    </button>
  );
}
