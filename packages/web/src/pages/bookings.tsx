import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetMe, useMyBookings, useCancelBooking, useCreateRating, useCreateReport } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Car, Phone, DollarSign, MessageSquare, Star, AlertTriangle, KeyRound } from "lucide-react";
import { RouteLine } from "@/components/route-line";
import { cacheBookings, getCachedBookings } from "@/lib/offline-cache";
import { WifiOff } from "lucide-react";

const CURRENCIES: Record<string, string> = { USD: "$", TRY: "₺", SYP: "ل.س" };
const CANCEL_REASONS = ["غيّرت خططي", "وجدت رحلة أفضل", "ظروف طارئة", "السعر غير مناسب", "تأخر موعد الرحلة", "سبب آخر"];

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار موافقة السائق",
  confirmed: "مؤكد",
  completed: "مكتمل",
  cancelled: "ملغى",
  rejected: "مرفوض",
};

/**
 * يشارك تفاصيل الرحلة مع شخص موثوق عبر واتساب — يحاول أولاً إرفاق موقع
 * GPS فعلي (رابط خرائط جوجل)، وإن رُفض الإذن أو تعذّر تحديد الموقع خلال
 * ثوانٍ قليلة، يُتابع بمشاركة النص وحده دون حجب الميزة بالكامل.
 */
function shareTripViaWhatsApp(trip: { origin: string; destination: string; driverName?: string | null; driverPhone?: string | null }) {
  function buildAndOpen(locationLine: string) {
    const text =
      "أنا الآن في رحلة من " +
      trip.origin +
      " إلى " +
      trip.destination +
      (trip.driverName ? " مع السائق " + trip.driverName : "") +
      (trip.driverPhone ? " (هاتفه: " + trip.driverPhone + ")" : "") +
      " عبر تطبيق Golog." +
      locationLine;
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }

  if (!navigator.geolocation) {
    buildAndOpen("");
    return;
  }

  const timeout = setTimeout(() => buildAndOpen(""), 4000);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      clearTimeout(timeout);
      const mapsLink = "https://maps.google.com/?q=" + pos.coords.latitude + "," + pos.coords.longitude;
      buildAndOpen("\nموقعي الحالي: " + mapsLink);
    },
    () => {
      clearTimeout(timeout);
      buildAndOpen("");
    },
    { timeout: 4000, maximumAge: 60000 },
  );
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="transition-colors cursor-pointer hover:scale-110"
        >
          <Star className={"w-6 h-6 transition-colors " + (star <= (hovered || value) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}

function RatingForm({ bookingId, driverName, onDone }: { bookingId: number; driverName: string; onDone: () => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const { toast } = useToast();
  const createRating = useCreateRating();

  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <p className="text-sm font-medium">قيّم السائق — {driverName}</p>
      <StarRating value={stars} onChange={setStars} />
      <Textarea placeholder="تعليق اختياري..." value={comment} onChange={(e) => setComment(e.target.value)} className="text-sm resize-none h-16" />
      <Button
        size="sm"
        className="w-full"
        disabled={stars === 0 || createRating.isPending}
        onClick={() =>
          createRating.mutate(
            { bookingId, rating: stars, comment: comment || undefined },
            {
              onSuccess: () => {
                toast({ title: "شكراً! تم إرسال تقييمك" });
                onDone();
              },
              onError: () => toast({ title: "فشل الإرسال", variant: "destructive" }),
            },
          )
        }
      >
        {createRating.isPending ? "جاري الإرسال..." : "إرسال التقييم"}
      </Button>
    </div>
  );
}

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "unsafe_driving", label: "قيادة غير آمنة" },
  { value: "inappropriate_behavior", label: "سلوك غير لائق" },
  { value: "no_show", label: "لم يحضر للموعد" },
  { value: "harassment", label: "مضايقة" },
  { value: "fraud_or_scam", label: "احتيال" },
  { value: "other", label: "سبب آخر" },
];

function ReportProblemDialog({
  open,
  onOpenChange,
  bookingId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: number;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const { toast } = useToast();
  const createReport = useCreateReport();

  function submit() {
    if (!reason) {
      toast({ title: "اختر سبب البلاغ أولاً", variant: "destructive" });
      return;
    }
    createReport.mutate(
      { bookingId, reason, details: details || undefined },
      {
        onSuccess: () => {
          toast({ title: "تم استلام بلاغك", description: "سيراجعه فريق الدعم قريباً" });
          onOpenChange(false);
          setReason("");
          setDetails("");
        },
        onError: () => toast({ title: "فشل إرسال البلاغ", variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            الإبلاغ عن مشكلة
          </DialogTitle>
          <DialogDescription>هذا بلاغ يراجعه فريق الدعم فعلياً، وليس مجرد تقييم — استخدمه لمشكلة أمان حقيقية.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {REPORT_REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={
                "text-xs rounded-lg border px-3 py-2 text-right transition-colors " +
                (reason === r.value ? "border-destructive bg-destructive/10 text-destructive font-medium" : "border-muted-foreground/20 text-muted-foreground")
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        <Textarea placeholder="تفاصيل إضافية (اختياري)..." value={details} onChange={(e) => setDetails(e.target.value)} className="text-sm resize-none h-20" />

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            تراجع
          </Button>
          <Button variant="destructive" className="w-full sm:w-auto" disabled={createReport.isPending} onClick={submit}>
            {createReport.isPending ? "جاري الإرسال..." : "إرسال البلاغ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelBookingDialog({
  open,
  onOpenChange,
  bookingId,
  tripInfo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: number;
  tripInfo: string;
}) {
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const { toast } = useToast();
  const cancelBooking = useCancelBooking();

  const effectiveReason = selectedReason === "سبب آخر" ? customReason.trim() : selectedReason;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-5 h-5" />
            إلغاء الحجز
          </DialogTitle>
          <DialogDescription>
            {tripInfo}
            <br />
            سيتلقى السائق إشعاراً بإلغائك. اختر سبباً لمساعدته.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm font-medium">سبب الإلغاء (اختياري)</p>
          <div className="grid grid-cols-2 gap-2">
            {CANCEL_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => setSelectedReason((prev) => (prev === reason ? "" : reason))}
                className={
                  "text-xs rounded-lg border px-3 py-2 text-right transition-colors " +
                  (selectedReason === reason
                    ? "border-destructive bg-destructive/10 text-destructive font-medium"
                    : "border-muted-foreground/20 hover:border-muted-foreground/50 text-muted-foreground")
                }
              >
                {reason}
              </button>
            ))}
          </div>

          {selectedReason === "سبب آخر" && (
            <Textarea placeholder="اكتب سببك هنا..." value={customReason} onChange={(e) => setCustomReason(e.target.value)} className="text-sm resize-none h-20 mt-2" autoFocus />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
            تراجع
          </Button>
          <Button
            variant="destructive"
            className="w-full sm:w-auto"
            disabled={cancelBooking.isPending}
            onClick={() =>
              cancelBooking.mutate(
                { id: bookingId, reason: effectiveReason || undefined },
                {
                  onSuccess: () => {
                    toast({ title: "تم إلغاء الحجز", description: "تم إشعار السائق بقرارك" });
                    onOpenChange(false);
                  },
                  onError: () => toast({ title: "فشل الإلغاء", variant: "destructive" }),
                },
              )
            }
          >
            {cancelBooking.isPending ? "جاري الإلغاء..." : "تأكيد الإلغاء"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BookingsPage() {
  const { data: user } = useGetMe();
  const { data: bookings, isLoading, isError } = useMyBookings();
  const [, setLocation] = useLocation();
  const [ratedBookings, setRatedBookings] = useState<Set<number>>(new Set());
  const [cancelDialog, setCancelDialog] = useState<{ bookingId: number; tripInfo: string } | null>(null);
  const [reportDialogBookingId, setReportDialogBookingId] = useState<number | null>(null);

  // احفظ رمز اللقاء وبيانات الحجز المؤكَّد محلياً فور وصولها — قد يحتاجها
  // الراكب لاحقاً في مكان بلا اتصال إنترنت (كنقطة عبور حدودية)
  useEffect(() => {
    if (bookings && bookings.length > 0) cacheBookings(bookings);
  }, [bookings]);

  const offline = isError && !bookings;
  const cachedFallback = offline ? getCachedBookings() : [];

  if (user?.currentRole !== "passenger") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-2xl font-bold">هذه الصفحة خاصة بالركاب</h2>
        <Button onClick={() => setLocation("/driver")}>العودة للوحة السائق</Button>
      </div>
    );
  }

  if (offline && cachedFallback.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          لا يوجد اتصال بالإنترنت حالياً — هذه آخر بيانات محفوظة على جهازك
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {cachedFallback.map((b) => (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center gap-2">
                  <span>{b.origin}</span>
                  <RouteLine />
                  <span>{b.destination}</span>
                </CardTitle>
                {b.departureTime && <p className="text-sm text-primary font-medium mt-1">{format(new Date(b.departureTime), "dd/MM/yyyy HH:mm")}</p>}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {b.driverName && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">السائق</span>
                    <span className="font-medium">{b.driverName}</span>
                  </div>
                )}
                {b.driverPhone && (
                  <a href={"tel:" + b.driverPhone} className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent text-accent-foreground font-bold py-3 text-base" dir="ltr">
                    <Phone className="w-5 h-5" /> {b.driverPhone}
                  </a>
                )}
                {b.status === "confirmed" && b.otpCode && (
                  <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 flex items-center justify-between mt-2">
                    <span className="text-xs font-medium">رمز اللقاء</span>
                    <span className="text-2xl font-mono font-bold tracking-[0.3em] text-primary" dir="ltr">
                      {b.otpCode}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">حجوزاتي</h1>
        <p className="text-muted-foreground">قائمة بالرحلات التي قمت بحجزها</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="w-8 h-8" />
        </div>
      ) : !bookings || bookings.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <p>لا يوجد لديك حجوزات حالياً</p>
            <Button variant="link" onClick={() => setLocation("/passenger")}>
              تصفح الرحلات المتاحة
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {bookings.map((booking) => {
            const trip = booking.trip;
            if (!trip) return null;
            const alreadyRated = ratedBookings.has(booking.id);
            const isInactive = booking.status === "cancelled" || booking.status === "rejected";

            return (
              <Card key={booking.id} className={isInactive ? "opacity-70 grayscale" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-xl flex items-center gap-2">
                        <span>{trip.origin}</span>
                        <RouteLine />
                        <span>{trip.destination}</span>
                      </CardTitle>
                      <p className="text-sm text-primary font-medium mt-1">{format(new Date(trip.departureTime), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                    <Badge variant={booking.status === "confirmed" || booking.status === "completed" ? "default" : isInactive ? "destructive" : "secondary"}>
                      {STATUS_LABEL[booking.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-2 space-y-2 text-sm">
                  {trip.driverName && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">السائق</span>
                      <span className="font-medium">{trip.driverName}</span>
                    </div>
                  )}
                  {trip.driverPhone && (
                    <a
                      href={"tel:" + trip.driverPhone}
                      className="flex items-center justify-center gap-2 w-full rounded-xl bg-accent text-accent-foreground font-bold py-3 text-base"
                      dir="ltr"
                    >
                      <Phone className="w-5 h-5" /> {trip.driverPhone}
                    </a>
                  )}
                  {trip.carType && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Car className="w-3 h-3" /> السيارة
                      </span>
                      <span>
                        {trip.carType}
                        {trip.carColor && " · " + trip.carColor}
                        {trip.carPlate && " · " + trip.carPlate}
                      </span>
                    </div>
                  )}
                  {trip.pricePerSeat && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <DollarSign className="w-3 h-3" /> السعر
                      </span>
                      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs font-mono">
                        {trip.pricePerSeat} {CURRENCIES[trip.currency] ?? trip.currency}
                      </Badge>
                    </div>
                  )}
                  {trip.womenFamilyOnly && (
                    <Badge variant="outline" className="text-pink-600 border-pink-200 bg-pink-50">
                      نسائي وعائلي
                    </Badge>
                  )}

                  {booking.status === "confirmed" && booking.otpCode && (
                    <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-primary" />
                          <span className="text-xs font-medium">رمز اللقاء</span>
                        </div>
                        <span className="text-2xl font-mono font-bold tracking-[0.3em] text-primary" dir="ltr">
                          {booking.otpCode}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        أعطِ هذا الرمز للسائق عند وصولك للسيارة — به يتأكد التطبيق أن اللقاء تمّ فعلاً، ولا تكتمل الرحلة بدونه.
                      </p>
                      <button
                        type="button"
                        onClick={() => shareTripViaWhatsApp(trip)}
                        className="flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md py-1.5 hover:bg-green-100 transition-colors w-full"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> شارك موقعك الحالي وتفاصيل الرحلة عبر واتساب
                      </button>
                    </div>
                  )}

                  {booking.accompaniedMinorsCount > 0 && (
                    <p className="text-xs text-pink-700 bg-pink-50 border border-pink-200 rounded-md px-2 py-1.5 mt-2">
                      يرافقك {booking.accompaniedMinorsCount} من الأطفال القاصرين ضمن هذا الحجز.
                    </p>
                  )}

                  {booking.status === "completed" && !alreadyRated && (
                    <RatingForm bookingId={booking.id} driverName={trip.driverName ?? "السائق"} onDone={() => setRatedBookings((prev) => new Set([...prev, booking.id]))} />
                  )}
                  {alreadyRated && (
                    <div className="border-t pt-3 mt-2 flex items-center gap-2 text-sm text-green-600">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      تم إرسال تقييمك — شكراً!
                    </div>
                  )}
                  {booking.status === "completed" && (
                    <button
                      onClick={() => setReportDialogBookingId(booking.id)}
                      className="text-xs text-muted-foreground underline flex items-center gap-1 mt-1"
                    >
                      <AlertTriangle className="w-3 h-3" /> الإبلاغ عن مشكلة في هذه الرحلة
                    </button>
                  )}
                </CardContent>
                {(booking.status === "confirmed" || booking.status === "pending") && (
                  <CardFooter className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full gap-2" onClick={() => setLocation("/messages/booking/" + booking.id)}>
                      <MessageSquare className="w-4 h-4" /> راسل السائق
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        setCancelDialog({
                          bookingId: booking.id,
                          tripInfo: trip.origin + " ← " + trip.destination + " · " + format(new Date(trip.departureTime), "dd/MM/yyyy"),
                        })
                      }
                    >
                      إلغاء الحجز
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {cancelDialog && (
        <CancelBookingDialog
          open={!!cancelDialog}
          onOpenChange={(open) => {
            if (!open) setCancelDialog(null);
          }}
          bookingId={cancelDialog.bookingId}
          tripInfo={cancelDialog.tripInfo}
        />
      )}

      {reportDialogBookingId !== null && (
        <ReportProblemDialog
          open={reportDialogBookingId !== null}
          onOpenChange={(open) => {
            if (!open) setReportDialogBookingId(null);
          }}
          bookingId={reportDialogBookingId}
        />
      )}
    </div>
  );
}
