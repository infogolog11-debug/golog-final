import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetMe,
  useMyTrips,
  useCreateTrip,
  useCancelTrip,
  useCities,
  useCrossings,
  useBookingsForMyTrips,
  useAcceptBooking,
  useRejectBooking,
  useConfirmBookingOtp,
  useNotifyArrival,
  useDriverParcels,
  useAcceptParcel,
  useRejectParcel,
  useConfirmParcelDelivery,
  useMatchesForTrip,
  useUpdateProfile,
  useListTrips,
} from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { format } from "date-fns";
import { MessageSquare, Users, Package, KeyRound, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RouteLine } from "@/components/route-line";
import { TelegramPromptBanner } from "@/components/telegram-prompt-banner";
import { CityPicker } from "@/components/city-picker";
import { QuickDateTimePicker } from "@/components/quick-datetime-picker";
import { SeatStepper } from "@/components/seat-stepper";

const CURRENCIES = [
  { value: "USD", label: "دولار (USD)" },
  { value: "TRY", label: "ليرة تركية (TRY)" },
  { value: "SYP", label: "ليرة سورية (SYP)" },
];

const tripSchema = z
  .object({
    origin: z.string().min(1, "يرجى اختيار نقطة الانطلاق"),
    destination: z.string().min(1, "يرجى اختيار الوجهة"),
    departureTime: z.string().min(1, "يرجى تحديد وقت الانطلاق"),
    totalSeats: z.coerce.number().min(1).max(8),
    womenFamilyOnly: z.boolean().default(false),
    crossingId: z.string().optional(),
    pricePerSeat: z.coerce.number().min(0).optional().or(z.literal("")),
    currency: z.enum(["USD", "TRY", "SYP"]).default("USD"),
    carType: z.string().max(60).optional(),
    carColor: z.string().max(30).optional(),
    carPlate: z.string().max(20).optional(),
    acceptsParcels: z.boolean().default(false),
    maxParcelWeightKg: z.coerce.number().min(0).max(5).optional().or(z.literal("")),
  })
  .refine((d) => d.origin !== d.destination, { message: "نقطة الانطلاق والوجهة لا يمكن أن تكونا متطابقتين", path: ["destination"] });

function PostTripForm({ onDone }: { onDone: () => void }) {
  const { data: user } = useGetMe();
  const { data: cities } = useCities();
  const { data: crossings } = useCrossings();
  const createTrip = useCreateTrip();
  const updateProfile = useUpdateProfile();
  const { toast } = useToast();
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const canPublishWomenFamily = user?.gender === "female" || !!user?.trustedForSensitiveTrips;

  const form = useForm<z.infer<typeof tripSchema>>({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      origin: "",
      destination: "",
      departureTime: "",
      totalSeats: 4,
      womenFamilyOnly: false,
      crossingId: "",
      pricePerSeat: "" as any,
      currency: "USD",
      carType: "",
      carColor: "",
      carPlate: "",
      acceptsParcels: false,
      maxParcelWeightKg: "" as any,
    },
  });

  // تعبئة بيانات السيارة تلقائياً من الملف الشخصي — لا داعي لإعادة كتابتها كل رحلة
  useEffect(() => {
    if (user?.carType || user?.carColor || user?.carPlate) {
      form.setValue("carType", user.carType ?? "");
      form.setValue("carColor", user.carColor ?? "");
      form.setValue("carPlate", user.carPlate ?? "");
    }
  }, [user?.carType, user?.carColor, user?.carPlate]);

  function onSubmit(data: z.infer<typeof tripSchema>) {
    createTrip.mutate(
      {
        kind: "offer",
        origin: data.origin,
        destination: data.destination,
        departureTime: new Date(data.departureTime).toISOString() as any,
        totalSeats: data.totalSeats,
        womenFamilyOnly: data.womenFamilyOnly,
        crossingId: data.crossingId && data.crossingId !== "none" ? (Number(data.crossingId) as any) : undefined,
        pricePerSeat: data.pricePerSeat !== "" && data.pricePerSeat !== undefined ? (String(data.pricePerSeat) as any) : undefined,
        currency: data.currency as any,
        carType: data.carType || undefined,
        carColor: data.carColor || undefined,
        carPlate: data.carPlate || undefined,
        acceptsParcels: data.acceptsParcels,
        maxParcelWeightKg: data.acceptsParcels && data.maxParcelWeightKg !== "" ? (String(data.maxParcelWeightKg) as any) : undefined,
      },
      {
        onSuccess: () => {
          // احفظ بيانات السيارة في الملف الشخصي إن تغيّرت، ليُعاد استخدامها تلقائياً في الرحلة القادمة
          if (data.carType !== (user?.carType ?? "") || data.carColor !== (user?.carColor ?? "") || data.carPlate !== (user?.carPlate ?? "")) {
            updateProfile.mutate({ carType: data.carType || undefined, carColor: data.carColor || undefined, carPlate: data.carPlate || undefined } as any);
          }
          form.reset({ ...form.getValues(), origin: "", destination: "", departureTime: "", pricePerSeat: "" as any });
          toast({ title: "تم نشر الرحلة بنجاح" });
          onDone();
        },
        onError: (e: any) => toast({ title: "فشل نشر الرحلة", description: e.message, variant: "destructive" }),
      },
    );
  }

  return (
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
              <FormLabel>وقت الانطلاق</FormLabel>
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
              <FormLabel>عدد المقاعد</FormLabel>
              <FormControl>
                <SeatStepper value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="womenFamilyOnly"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel className="text-pink-700">رحلة نسائية وعائلية فقط</FormLabel>
                <p className="text-xs text-muted-foreground">{canPublishWomenFamily ? "أنتِ مؤهلة لنشر هذا النوع من الرحلات" : "متاح فقط للسائقات، أو لسائق موثّق يدوياً من الإدارة"}</p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={!canPublishWomenFamily} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="acceptsParcels"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <FormLabel>أقبل نقل طرود خفيفة على هذه الرحلة</FormLabel>
                <p className="text-xs text-muted-foreground">حد أقصى مقترح 5 كغ للطرد</p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        {/* التفاصيل الثانوية مطوية افتراضياً — تقليل العبء البصري لمن لا يحتاجها الآن */}
        <button
          type="button"
          onClick={() => setShowMoreDetails((v) => !v)}
          className="text-sm text-primary underline w-full text-center py-1"
        >
          {showMoreDetails ? "إخفاء التفاصيل الإضافية" : "تفاصيل إضافية (اختياري): السعر، المعبر، السيارة"}
        </button>

        {showMoreDetails && (
          <div className="space-y-4 rounded-lg border p-3 bg-muted/30">
            <FormField
              control={form.control}
              name="crossingId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>المعبر الحدودي (اختياري)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="بدون تحديد" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">بدون تحديد</SelectItem>
                      {(crossings ?? []).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name} {c.status === "closed" ? "(مغلق حالياً)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="pricePerSeat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>السعر للمقعد</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>العملة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <FormField control={form.control} name="carType" render={({ field }) => <FormItem><FormLabel>نوع السيارة</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>} />
              <FormField control={form.control} name="carColor" render={({ field }) => <FormItem><FormLabel>اللون</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>} />
              <FormField control={form.control} name="carPlate" render={({ field }) => <FormItem><FormLabel>اللوحة</FormLabel><FormControl><Input {...field} /></FormControl></FormItem>} />
            </div>

            {form.watch("acceptsParcels") && (
              <FormField
                control={form.control}
                name="maxParcelWeightKg"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أقصى وزن للطرد (كغ)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={5} step={0.5} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            )}
          </div>
        )}

        <Button type="submit" size="lg" className="w-full h-13 text-base" disabled={createTrip.isPending}>
          {createTrip.isPending ? "جاري النشر..." : "نشر الرحلة"}
        </Button>
      </form>
    </Form>
  );
}


function MatchesForTrip({ tripId }: { tripId: number }) {
  const { data } = useMatchesForTrip(tripId);
  if (!data || (data.passengerRequests.length === 0 && data.parcelRequests.length === 0)) return null;

  return (
    <div className="border-t pt-3 mt-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">طلبات مطابقة لهذه الرحلة</p>
      {data.passengerRequests.map((r) => (
        <div key={"r" + r.id} className="text-xs bg-primary/5 rounded p-2 flex items-center justify-between">
          <span>
            <Users className="w-3 h-3 inline ml-1" /> راكب: {r.origin} → {r.destination}
          </span>
        </div>
      ))}
      {data.parcelRequests.map((p) => (
        <div key={"p" + p.id} className="text-xs bg-violet-50 rounded p-2 flex items-center justify-between">
          <span>
            <Package className="w-3 h-3 inline ml-1" /> طرد: {p.origin} → {p.destination} ({p.weightKg} كغ)
          </span>
        </div>
      ))}
    </div>
  );
}

function MyTripsTab() {
  const { data: trips, isLoading } = useMyTrips();
  const { data: pendingRequests } = useListTrips({ kind: "request" });
  const cancelTrip = useCancelTrip();
  const [, setLocation] = useLocation();

  if (isLoading) return <Spinner className="w-6 h-6" />;
  const offers = trips?.filter((t) => t.kind === "offer") ?? [];

  if (offers.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center p-10 text-center space-y-2">
          <p className="text-muted-foreground">لم تنشر أي رحلة بعد</p>
          {pendingRequests && pendingRequests.length > 0 && (
            <p className="text-sm text-primary font-medium">
              {pendingRequests.length} راكب ينتظر رحلة الآن — انشر أول عرض لك وقد تصل إليهم مباشرة
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {offers.map((trip) => (
        <Card key={trip.id}>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>{trip.origin}</span>
                  <RouteLine />
                  <span>{trip.destination}</span>
                </CardTitle>
                <p className="text-sm text-primary">{format(new Date(trip.departureTime), "dd/MM/yyyy HH:mm")}</p>
              </div>
              <Badge variant={trip.status === "active" ? "default" : trip.status === "full" ? "secondary" : "outline"}>
                {trip.status === "active" ? "نشطة" : trip.status === "full" ? "مكتملة" : trip.status === "cancelled" ? "ملغاة" : "منتهية"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="text-muted-foreground">
              المقاعد المتاحة: {trip.availableSeats} / {trip.totalSeats}
            </p>
            {trip.womenFamilyOnly && (
              <Badge variant="outline" className="text-pink-600 border-pink-200 bg-pink-50">
                نسائي وعائلي
              </Badge>
            )}
            {trip.acceptsParcels && (
              <Badge variant="outline" className="text-violet-600 border-violet-200 bg-violet-50 mr-1">
                يقبل الطرود
              </Badge>
            )}
            {trip.status === "active" && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => cancelTrip.mutate(trip.id)}>
                إلغاء الرحلة
              </Button>
            )}
            <MatchesForTrip tripId={trip.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OtpConfirmInline({ bookingId }: { bookingId: number }) {
  const [otp, setOtp] = useState("");
  const confirmOtp = useConfirmBookingOtp();
  const { toast } = useToast();

  return (
    <div className="flex items-center gap-2">
      <InputOTP maxLength={4} value={otp} onChange={setOtp}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
        </InputOTPGroup>
      </InputOTP>
      <Button
        size="sm"
        disabled={otp.length !== 4 || confirmOtp.isPending}
        onClick={() =>
          confirmOtp.mutate(
            { id: bookingId, otpCode: otp },
            {
              onSuccess: () => toast({ title: "تم تأكيد اللقاء بنجاح" }),
              onError: () => toast({ title: "رمز غير صحيح", variant: "destructive" }),
            },
          )
        }
      >
        تأكيد
      </Button>
    </div>
  );
}

function BookingsTab() {
  const { data: bookings, isLoading } = useBookingsForMyTrips();
  const acceptBooking = useAcceptBooking();
  const rejectBooking = useRejectBooking();
  const notifyArrival = useNotifyArrival();
  const [arrivedIds, setArrivedIds] = useState<Set<number>>(new Set());
  const [, setLocation] = useLocation();

  if (isLoading) return <Spinner className="w-6 h-6" />;
  if (!bookings || bookings.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">لا يوجد حجوزات بعد</p>;

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <Card key={b.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{b.passengerName ?? "راكب"}</p>
                <p className="text-xs text-muted-foreground">
                  {b.trip?.origin} ← {b.trip?.destination} · {b.seatsBooked} مقعد
                </p>
                {b.accompaniedMinorsCount > 0 && (
                  <Badge className="mt-1 text-xs bg-pink-50 text-pink-700 border-pink-200">
                    برفقة {b.accompaniedMinorsCount} من القاصرين
                  </Badge>
                )}
              </div>
              <Badge>{b.status === "pending" ? "بانتظار الرد" : b.status === "confirmed" ? "مؤكد" : b.status === "completed" ? "مكتمل" : b.status}</Badge>
            </div>

            {b.passengerPhone && (
              <a href={"tel:" + b.passengerPhone} className="text-xs text-primary underline" dir="ltr">
                {b.passengerPhone}
              </a>
            )}

            {b.status === "pending" && (
              <div className="flex gap-2 pt-2">
                <Button size="sm" className="gap-1.5" onClick={() => acceptBooking.mutate({ id: b.id })}>
                  <CheckCircle className="w-4 h-4" /> قبول
                </Button>
                <Button size="sm" variant="outline" onClick={() => rejectBooking.mutate({ id: b.id })}>
                  رفض
                </Button>
              </div>
            )}

            {b.status === "confirmed" && (
              <div className="pt-2 space-y-2">
                {arrivedIds.has(b.id) ? (
                  <p className="text-xs text-green-600 flex items-center gap-1.5 font-medium">
                    <CheckCircle className="w-3.5 h-3.5" /> تم إشعار الراكب بوصولك
                  </p>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 w-full"
                    disabled={notifyArrival.isPending}
                    onClick={() =>
                      notifyArrival.mutate(
                        { id: b.id },
                        { onSuccess: () => setArrivedIds((prev) => new Set([...prev, b.id])) },
                      )
                    }
                  >
                    📍 وصلت لنقطة اللقاء
                  </Button>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> اطلب من الراكب الرمز عند اللقاء وأدخله هنا
                </p>
                <OtpConfirmInline bookingId={b.id} />
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setLocation("/messages/booking/" + b.id)}>
                  <MessageSquare className="w-3.5 h-3.5" /> مراسلة
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ParcelsTab() {
  const { data: parcels, isLoading } = useDriverParcels();
  const confirmDelivery = useConfirmParcelDelivery();
  const [otpMap, setOtpMap] = useState<Record<number, string>>({});

  if (isLoading) return <Spinner className="w-6 h-6" />;
  if (!parcels || parcels.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">لا يوجد طرود مقبولة بعد</p>;

  return (
    <div className="space-y-3">
      {parcels.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">
                  {p.origin} ← {p.destination}
                </p>
                <p className="text-xs text-muted-foreground">{p.description} · {p.weightKg} كغ</p>
                <p className="text-xs text-muted-foreground">المستلم: {p.receiverName} · {p.receiverPhone}</p>
              </div>
              <Badge>{p.status === "accepted" ? "قيد التوصيل" : "تم التسليم"}</Badge>
            </div>

            {p.status === "accepted" && (
              <div className="flex items-center gap-2 pt-2">
                <InputOTP
                  maxLength={4}
                  value={otpMap[p.id] ?? ""}
                  onChange={(v) => setOtpMap((prev) => ({ ...prev, [p.id]: v }))}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  size="sm"
                  disabled={confirmDelivery.isPending || (otpMap[p.id] ?? "").length !== 4}
                  onClick={() => confirmDelivery.mutate({ id: p.id, otpCode: otpMap[p.id] })}
                >
                  تأكيد التسليم
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function DriverPage() {
  const { data: user } = useGetMe();
  const [, setLocation] = useLocation();
  const [showForm, setShowForm] = useState(false);

  if (user?.currentRole !== "driver") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-2xl font-bold">أنت حالياً في وضع الراكب</h2>
        <Button onClick={() => setLocation("/passenger")}>الذهاب إلى صفحة الركاب</Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <TelegramPromptBanner />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">لوحة تحكم السائق</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>إضافة رحلة جديدة</CardTitle>
              <CardDescription>انشر تفاصيل رحلتك القادمة</CardDescription>
            </CardHeader>
            <CardContent>
              <PostTripForm onDone={() => setShowForm(false)} />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Tabs defaultValue="trips">
            <TabsList>
              <TabsTrigger value="trips">رحلاتي</TabsTrigger>
              <TabsTrigger value="bookings">الحجوزات</TabsTrigger>
              <TabsTrigger value="parcels">الطرود</TabsTrigger>
            </TabsList>
            <TabsContent value="trips" className="mt-4">
              <MyTripsTab />
            </TabsContent>
            <TabsContent value="bookings" className="mt-4">
              <BookingsTab />
            </TabsContent>
            <TabsContent value="parcels" className="mt-4">
              <ParcelsTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
