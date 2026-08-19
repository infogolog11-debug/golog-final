import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetMe,
  useMatchedOffers,
  useListTrips,
  useCreateBooking,
  useCreateTrip,
  useCities,
  useUserRatings,
  useListParcels,
  useCreateParcel,
} from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Car, DollarSign, Phone, BadgeCheck, Star, Heart, Package, Plus } from "lucide-react";
import type { Trip } from "@/lib/types";
import { RouteLine } from "@/components/route-line";
import { TelegramPromptBanner } from "@/components/telegram-prompt-banner";
import { CityPicker } from "@/components/city-picker";
import { QuickDateTimePicker } from "@/components/quick-datetime-picker";
import { SeatStepper } from "@/components/seat-stepper";

const CURRENCIES: Record<string, string> = { USD: "$", TRY: "₺", SYP: "ل.س" };

const QUICK_ROUTES = [
  { origin: "حلب", destination: "غازي عنتاب" },
  { origin: "إدلب", destination: "هاتاي (أنطاكيا)" },
  { origin: "أعزاز", destination: "كلس" },
];

function StarDisplay({ value, count }: { value: number | null; count?: number }) {
  if (!value) return null;
  return (
    <span className="flex items-center gap-0.5" dir="ltr">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={"w-3 h-3 " + (s <= Math.round(value) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")} />
      ))}
      <span className="text-xs font-medium mr-1">{value.toFixed(1)}</span>
      {count !== undefined && <span className="text-xs text-muted-foreground">({count})</span>}
    </span>
  );
}

function BookTripDialog({ trip, open, onOpenChange }: { trip: Trip; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: user } = useGetMe();
  const createBooking = useCreateBooking();
  const { toast } = useToast();
  const [seats, setSeats] = useState(1);
  const [accompaniedMinorsCount, setAccompaniedMinorsCount] = useState(0);

  const blockedByFamilyRule = trip.womenFamilyOnly && user?.gender !== "female";

  function handleSubmit() {
    if (blockedByFamilyRule) {
      toast({ title: "هذه الرحلة مخصصة للراكبات فقط", variant: "destructive" });
      return;
    }
    createBooking.mutate(
      {
        tripId: trip.id,
        seatsBooked: seats,
        accompaniedMinorsCount,
      },
      {
        onSuccess: () => {
          toast({ title: "تم إرسال طلب الحجز — بانتظار موافقة السائق" });
          onOpenChange(false);
        },
        onError: (e: any) => toast({ title: "فشل الحجز", description: e.message, variant: "destructive" }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>حجز مقعد</DialogTitle>
          <DialogDescription>
            {trip.origin} ← {trip.destination} · {format(new Date(trip.departureTime), "dd/MM/yyyy HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">عدد المقاعد</label>
            <SeatStepper value={seats} onChange={setSeats} max={trip.availableSeats} />
          </div>

          {trip.womenFamilyOnly && (
            <div className="rounded-lg border-2 border-pink-200 bg-pink-50/40 p-3 space-y-2">
              {blockedByFamilyRule ? (
                <p className="text-xs text-pink-700">هذه الرحلة مخصصة للراكبات فقط.</p>
              ) : (
                <>
                  <label className="text-sm font-medium text-pink-800">عدد الأطفال المرافقين لك (إن وجد)</label>
                  <SeatStepper value={accompaniedMinorsCount} onChange={setAccompaniedMinorsCount} max={8} />
                  <p className="text-xs text-pink-700">
                    لا يسافر أي قاصر إلا برفقة وليّه الفعلية ضمن هذا الحجز نفسه.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button className="w-full" onClick={handleSubmit} disabled={createBooking.isPending}>
            {createBooking.isPending ? "جاري الإرسال..." : "تأكيد طلب الحجز"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const [, setLocation] = useLocation();
  const [bookOpen, setBookOpen] = useState(false);
  const { data: ratingData } = useUserRatings(trip.driverId ?? undefined);

  return (
    <Card>
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
          {trip.womenFamilyOnly && (
            <Badge className="bg-pink-100 text-pink-800 border-pink-200 gap-1 shrink-0">
              <Heart className="w-3 h-3" /> نسائي وعائلي
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">السائق</span>
          <span className="font-medium flex items-center gap-1">
            {trip.driverName ?? "—"}
            {trip.driverIsVerified && <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />}
          </span>
        </div>
        {(ratingData && ratingData.count > 0) || !!trip.driverCompletedRides ? (
          <div className="flex justify-end items-center gap-2">
            {!!trip.driverCompletedRides && (
              <span className="text-xs text-muted-foreground">{trip.driverCompletedRides} رحلة مكتملة</span>
            )}
            {ratingData && ratingData.count > 0 && <StarDisplay value={ratingData.average} count={ratingData.count} />}
          </div>
        ) : null}
        {trip.driverPhone && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Phone className="w-3 h-3" /> الهاتف
            </span>
            <a href={"tel:" + trip.driverPhone} className="text-primary hover:underline" dir="ltr">
              {trip.driverPhone}
            </a>
          </div>
        )}
        {trip.carType && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Car className="w-3 h-3" /> السيارة
            </span>
            <span>
              {trip.carType}
              {trip.carColor && " · " + trip.carColor}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">المقاعد المتاحة</span>
          <span className="font-medium">{trip.availableSeats}</span>
        </div>
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
        {trip.acceptsParcels && (
          <Badge variant="outline" className="text-violet-600 border-violet-200 bg-violet-50 gap-1">
            <Package className="w-3 h-3" /> يقبل الطرود
          </Badge>
        )}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button className="flex-1 gap-2" onClick={() => setBookOpen(true)} disabled={trip.availableSeats < 1}>
          {trip.availableSeats < 1 ? "مكتملة" : "احجز مقعد"}
        </Button>
      </CardFooter>
      <BookTripDialog trip={trip} open={bookOpen} onOpenChange={setBookOpen} />
    </Card>
  );
}

function SearchTab({ category, onRequestTrip }: { category?: "women_family"; onRequestTrip: () => void }) {
  const { data: cities } = useCities();
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<"origin" | "destination" | null>(null);

  const matched = useMatchedOffers({ origin: origin || undefined, destination: destination || undefined, all: showAll ? "true" : undefined });
  const categoryList = useListTrips(category ? { category } : {});

  const trips = category ? categoryList.data : matched.data?.trips;
  const isLoading = category ? categoryList.isLoading : matched.isLoading;
  const hasFilter = !!origin || !!destination;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {QUICK_ROUTES.map((r) => (
          <button
            key={r.origin + r.destination}
            onClick={() => {
              setOrigin(r.origin);
              setDestination(r.destination);
            }}
            className="shrink-0 flex items-center gap-1.5 rounded-full border border-card-border bg-card px-3 py-1.5 text-xs font-medium whitespace-nowrap"
          >
            {r.origin} <RouteLine className="h-2.5 w-6" /> {r.destination}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setPickerOpen("origin")}
          className="rounded-xl border-2 border-card-border bg-card py-3 px-3 text-right"
        >
          <span className="block text-[11px] text-muted-foreground">من</span>
          <span className="block text-sm font-bold truncate">{origin || "اختر مدينة"}</span>
        </button>
        <button
          onClick={() => setPickerOpen("destination")}
          className="rounded-xl border-2 border-card-border bg-card py-3 px-3 text-right"
        >
          <span className="block text-[11px] text-muted-foreground">إلى</span>
          <span className="block text-sm font-bold truncate">{destination || "اختر مدينة"}</span>
        </button>
      </div>

      <Dialog open={!!pickerOpen} onOpenChange={(o) => !o && setPickerOpen(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{pickerOpen === "origin" ? "اختر مدينة الانطلاق" : "اختر الوجهة"}</DialogTitle>
          </DialogHeader>
          <CityPicker
            cities={cities ?? []}
            value={pickerOpen === "origin" ? origin : destination}
            excludeCity={pickerOpen === "origin" ? destination : origin}
            onChange={(city) => {
              if (pickerOpen === "origin") setOrigin(city);
              else setDestination(city);
              setPickerOpen(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {!category && !showAll && (
        <button onClick={() => setShowAll(true)} className="text-xs text-primary underline">
          عرض كل الرحلات بدل المطابقة الافتراضية
        </button>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="w-8 h-8" />
        </div>
      ) : !trips || trips.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-10 text-center space-y-3">
            <p className="text-muted-foreground">
              {hasFilter || category ? "لا توجد رحلات على هذا الخط بعد" : "لا توجد رحلات مطابقة لبحثك حالياً"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs">
              كن أول من يطلب هذه الرحلة — سيصل إشعار فوري لكل سائق ينشر عرضاً مطابقاً لاحقاً
            </p>
            <Button variant="outline" size="sm" onClick={onRequestTrip} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> اطلب هذه الرحلة الآن
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {trips.map((t) => (
            <TripCard key={t.id} trip={t} />
          ))}
        </div>
      )}
    </div>
  );
}

const requestSchema = z.object({
  origin: z.string().min(1, "يرجى اختيار نقطة الانطلاق"),
  destination: z.string().min(1, "يرجى اختيار الوجهة"),
  departureTime: z.string().min(1, "يرجى تحديد الوقت المفضل"),
  totalSeats: z.coerce.number().min(1).max(8),
});

function RequestTripForm() {
  const { data: cities } = useCities();
  const createTrip = useCreateTrip();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { origin: "", destination: "", departureTime: "", totalSeats: 1 },
  });

  function onSubmit(data: z.infer<typeof requestSchema>) {
    createTrip.mutate(
      {
        kind: "request",
        origin: data.origin,
        destination: data.destination,
        departureTime: new Date(data.departureTime).toISOString() as any,
        totalSeats: data.totalSeats,
      },
      {
        onSuccess: () => {
          toast({ title: "تم نشر طلبك — سيصلك إشعار عند توفر رحلة مطابقة" });
          form.reset();
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>اطلب رحلة</CardTitle>
        <CardDescription>لم تجد رحلة مناسبة؟ انشر طلبك وسيراك السائقون المطابقون</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="origin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>من</FormLabel>
                  <FormControl>
                    <CityPicker cities={cities ?? []} value={field.value} excludeCity={form.watch("destination")} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>إلى</FormLabel>
                  <FormControl>
                    <CityPicker cities={cities ?? []} value={field.value} excludeCity={form.watch("origin")} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="departureTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الوقت المفضل</FormLabel>
                  <FormControl>
                    <QuickDateTimePicker value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalSeats"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>عدد المقاعد المطلوبة</FormLabel>
                  <FormControl>
                    <SeatStepper value={field.value} onChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit" size="lg" className="w-full h-13 text-base" disabled={createTrip.isPending}>
              {createTrip.isPending ? "جاري النشر..." : "نشر الطلب"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

const parcelSchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  description: z.string().min(1, "صف محتوى الطرد"),
  weightKg: z.coerce.number().min(0.1).max(5),
  receiverName: z.string().min(1),
  receiverPhone: z.string().min(1),
});

const PROHIBITED_ITEMS = ["أموال نقدية", "مستندات رسمية / جوازات", "أدوية بدون وصفة", "مواد تحتاج تصريح جمركي", "أسلحة", "مواد قابلة للاشتعال"];

function ParcelsTab() {
  const { data: parcels, isLoading } = useListParcels();
  const createParcel = useCreateParcel();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const form = useForm<z.infer<typeof parcelSchema>>({
    resolver: zodResolver(parcelSchema),
    defaultValues: { origin: "", destination: "", description: "", weightKg: 1, receiverName: "", receiverPhone: "" },
  });

  function onSubmit(data: z.infer<typeof parcelSchema>) {
    if (!accepted) {
      toast({ title: "يرجى الإقرار بعدم وجود مواد ممنوعة", variant: "destructive" });
      return;
    }
    createParcel.mutate(
      { ...data, weightKg: String(data.weightKg) as any },
      {
        onSuccess: () => {
          toast({ title: "تم نشر طلب الشحن" });
          form.reset();
          setShowForm(false);
          setAccepted(false);
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" className="gap-2" onClick={() => setShowForm((v) => !v)}>
        <Plus className="w-4 h-4" /> طلب شحن طرد جديد
      </Button>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">تفاصيل الطرد</CardTitle>
            <CardDescription>الممنوعات: {PROHIBITED_ITEMS.join("، ")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="origin" render={({ field }) => <FormItem><FormLabel>من</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name="destination" render={({ field }) => <FormItem><FormLabel>إلى</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <FormField control={form.control} name="description" render={({ field }) => <FormItem><FormLabel>وصف المحتوى</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="weightKg" render={({ field }) => <FormItem><FormLabel>الوزن (كغ، حد أقصى 5)</FormLabel><FormControl><Input type="number" min={0.1} max={5} step={0.1} {...field} /></FormControl><FormMessage /></FormItem>} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="receiverName" render={({ field }) => <FormItem><FormLabel>اسم المستلم</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
                  <FormField control={form.control} name="receiverPhone" render={({ field }) => <FormItem><FormLabel>هاتف المستلم</FormLabel><FormControl><Input dir="ltr" {...field} /></FormControl><FormMessage /></FormItem>} />
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                  أقرّ بأن الطرد لا يحتوي على أي من المواد الممنوعة المذكورة أعلاه
                </label>
                <Button type="submit" className="w-full" disabled={createParcel.isPending}>
                  {createParcel.isPending ? "جاري النشر..." : "نشر طلب الشحن"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Spinner className="w-6 h-6" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {parcels?.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-4 text-sm space-y-1">
                <p className="font-medium">
                  {p.origin} ← {p.destination}
                </p>
                <p className="text-muted-foreground">{p.description}</p>
                <p className="text-xs text-muted-foreground">{p.weightKg} كغ · {p.status === "pending" ? "بانتظار سائق" : p.status}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PassengerPage() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("all");

  if (user?.currentRole !== "passenger") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-2xl font-bold">أنت حالياً في وضع السائق</h2>
        <Button onClick={() => setLocation("/driver")}>الذهاب إلى لوحة السائق</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TelegramPromptBanner />
      <h1 className="text-3xl font-bold tracking-tight">ابحث عن رحلة</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">كل الرحلات</TabsTrigger>
          <TabsTrigger value="women" className="gap-1.5">
            <Heart className="w-3.5 h-3.5" /> نسائي وعائلي
          </TabsTrigger>
          <TabsTrigger value="request">اطلب رحلة</TabsTrigger>
          <TabsTrigger value="parcels" className="gap-1.5">
            <Package className="w-3.5 h-3.5" /> الطرود
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <SearchTab onRequestTrip={() => setActiveTab("request")} />
        </TabsContent>
        <TabsContent value="women" className="mt-4">
          <SearchTab category="women_family" onRequestTrip={() => setActiveTab("request")} />
        </TabsContent>
        <TabsContent value="request" className="mt-4">
          <RequestTripForm />
        </TabsContent>
        <TabsContent value="parcels" className="mt-4">
          <ParcelsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
