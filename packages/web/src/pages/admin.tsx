import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@/lib/queries";
import { api } from "@/lib/api";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Users, MapPin, Waypoints, BadgeCheck, Clock, CheckCircle2, XCircle, Ban, BarChart2, ShieldCheck, Plus, Trash2, AlertTriangle } from "lucide-react";
import type { User, DriverVerification, Trip, Booking, Parcel, City, Crossing, Report } from "@/lib/types";
import { ADMIN_PERMISSION_LABELS } from "@/lib/types";

const ADMIN_PERMISSIONS_LIST = ["users", "verifications", "reports", "trips_bookings", "pricing", "catalog"] as const;

function useAdmin<T>(key: string, path: string) {
  return useQuery<T>({ queryKey: ["admin", key], queryFn: () => api.get(path) });
}

function UsersTab() {
  const { data, isLoading } = useAdmin<{ users: User[] }>("users", "/admin/users");
  const qc = useQueryClient();
  const { toast } = useToast();

  const ban = useMutation({
    mutationFn: ({ id, banned }: { id: number; banned: boolean }) => api.post("/admin/users/" + id + "/" + (banned ? "ban" : "unban")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const setTrusted = useMutation({
    mutationFn: ({ id, trusted }: { id: number; trusted: boolean }) => api.post("/admin/users/" + id + "/trusted-for-sensitive-trips", { trusted }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "تم تحديث صلاحية الرحلات الحساسة" });
    },
  });

  if (isLoading) return <Spinner className="w-6 h-6" />;

  return (
    <div className="space-y-3">
      {data?.users.map((u) => (
        <Card key={u.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{u.name}</span>
                {u.isVerified && (
                  <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1 text-xs">
                    <BadgeCheck className="w-3 h-3" /> موثّق
                  </Badge>
                )}
                {u.isBanned && <Badge variant="destructive">محظور</Badge>}
                {u.isAdmin && <Badge variant="outline">أدمن</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {u.email ?? u.telegramUsername ?? "—"} · {u.currentRole === "driver" ? "سائق" : "راكب"} · {u.gender === "female" ? "أنثى" : u.gender === "male" ? "ذكر" : "—"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {u.gender !== "female" && (
                <Button
                  size="sm"
                  variant={u.trustedForSensitiveTrips ? "default" : "outline"}
                  onClick={() => setTrusted.mutate({ id: u.id, trusted: !u.trustedForSensitiveTrips })}
                  className="text-xs gap-1"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {u.trustedForSensitiveTrips ? "موثوق للرحلات الحساسة" : "منح ثقة الرحلات الحساسة"}
                </Button>
              )}
              <Button size="sm" variant={u.isBanned ? "outline" : "destructive"} onClick={() => ban.mutate({ id: u.id, banned: !u.isBanned })} className="text-xs gap-1">
                <Ban className="w-3.5 h-3.5" />
                {u.isBanned ? "رفع الحظر" : "حظر"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VerificationsTab() {
  const { data, isLoading } = useAdmin<{ verifications: DriverVerification[] }>("verifications", "/admin/verifications");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  const approve = useMutation({
    mutationFn: (id: number) => api.post("/admin/verifications/" + id + "/approve"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
      toast({ title: "تم التوثيق" });
    },
  });
  const reject = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => api.post("/admin/verifications/" + id + "/reject", { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "verifications"] });
      toast({ title: "تم الرفض" });
    },
  });

  if (isLoading) return <Spinner className="w-6 h-6" />;
  const pending = data?.verifications.filter((v) => v.status === "pending") ?? [];

  if (pending.length === 0) return <p className="text-muted-foreground text-sm py-8 text-center">لا يوجد طلبات توثيق قيد المراجعة</p>;

  return (
    <div className="space-y-3">
      {pending.map((v) => (
        <Card key={v.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> رخصة رقم {v.licenseNumber}
                </p>
                {v.vehicleInfo && <p className="text-xs text-muted-foreground">{v.vehicleInfo}</p>}
              </div>
              <a href={v.documentObjectPath} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                عرض الوثيقة
              </a>
            </div>
            <Textarea
              placeholder="ملاحظة عند الرفض (اختياري)"
              className="text-sm h-16 resize-none"
              value={noteMap[v.id] ?? ""}
              onChange={(e) => setNoteMap((p) => ({ ...p, [v.id]: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="sm" className="gap-1.5" onClick={() => approve.mutate(v.id)} disabled={approve.isPending}>
                <CheckCircle2 className="w-4 h-4" /> موافقة
              </Button>
              <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => reject.mutate({ id: v.id, note: noteMap[v.id] })} disabled={reject.isPending}>
                <XCircle className="w-4 h-4" /> رفض
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OperationsTab() {
  const { data: trips } = useAdmin<{ trips: Trip[] }>("trips", "/admin/trips");
  const { data: bookings } = useAdmin<{ bookings: Booking[] }>("bookings", "/admin/bookings");
  const { data: parcels } = useAdmin<{ parcels: Parcel[] }>("parcels", "/admin/parcels");
  const qc = useQueryClient();

  const cancelTrip = useMutation({
    mutationFn: (id: number) => api.post("/admin/trips/" + id + "/cancel"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "trips"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground">الرحلات النشطة ({trips?.trips.filter((t) => t.status === "active").length ?? 0})</h3>
        <div className="space-y-2">
          {trips?.trips
            .filter((t) => t.status === "active")
            .map((t) => (
              <Card key={t.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <span className="text-sm">
                    #{t.id} · {t.origin} ← {t.destination} · {t.kind === "offer" ? "عرض" : "طلب"}
                    {t.womenFamilyOnly && " · نسائي وعائلي"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => cancelTrip.mutate(t.id)}>
                    إلغاء
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground">آخر الحجوزات ({bookings?.bookings.length ?? 0})</h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          {bookings?.bookings.slice(0, 10).map((b) => (
            <div key={b.id}>
              حجز #{b.id} — {b.status} — {b.seatsBooked} مقعد
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground">آخر الشحنات ({parcels?.parcels.length ?? 0})</h3>
        <div className="space-y-1 text-sm text-muted-foreground">
          {parcels?.parcels.slice(0, 10).map((p) => (
            <div key={p.id}>
              طرد #{p.id} — {p.origin} ← {p.destination} — {p.status}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PricingTab() {
  const { data, isLoading } = useAdmin<{
    passengerPricing: { origin: string; destination: string; avgPrice: number; minPrice: number; maxPrice: number; count: number }[];
    parcelPricing: { origin: string; destination: string; avgPrice: number; minPrice: number; maxPrice: number; count: number }[];
  }>("pricing", "/admin/reports/pricing");

  if (isLoading) return <Spinner className="w-6 h-6" />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" /> أسعار ركوب الأشخاص حسب خط السير
        </h3>
        <div className="space-y-2">
          {data?.passengerPricing.map((p, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center justify-between text-sm">
                <span>
                  {p.origin} ← {p.destination} ({p.count})
                </span>
                <span className="font-mono">
                  {Math.round(p.avgPrice)} (متوسط) · {p.minPrice}–{p.maxPrice}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground flex items-center gap-1.5">
          <BarChart2 className="w-4 h-4" /> أسعار الشحن حسب خط السير
        </h3>
        <div className="space-y-2">
          {data?.parcelPricing.map((p, i) => (
            <Card key={i}>
              <CardContent className="p-3 flex items-center justify-between text-sm">
                <span>
                  {p.origin} ← {p.destination} ({p.count})
                </span>
                <span className="font-mono">
                  {Math.round(p.avgPrice)} (متوسط) · {p.minPrice}–{p.maxPrice}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogTab() {
  const { data: cities } = useAdmin<{ cities: City[] }>("cities", "/admin/cities");
  const { data: crossings } = useAdmin<{ crossings: Crossing[] }>("crossings", "/admin/crossings");
  const qc = useQueryClient();
  const [newCity, setNewCity] = useState("");
  const [newCrossing, setNewCrossing] = useState("");

  const addCity = useMutation({
    mutationFn: (name: string) => api.post("/admin/cities", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "cities"] });
      setNewCity("");
    },
  });
  const deleteCity = useMutation({
    mutationFn: (id: number) => api.delete("/admin/cities/" + id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "cities"] }),
  });
  const addCrossing = useMutation({
    mutationFn: (name: string) => api.post("/admin/crossings", { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "crossings"] });
      setNewCrossing("");
    },
  });
  const toggleCrossing = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "open" | "closed" }) => api.patch("/admin/crossings/" + id + "/status", { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "crossings"] }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> المدن
        </h3>
        <div className="flex gap-2 mb-3">
          <Input value={newCity} onChange={(e) => setNewCity(e.target.value)} placeholder="اسم مدينة جديدة" />
          <Button onClick={() => newCity.trim() && addCity.mutate(newCity.trim())} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> إضافة
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {cities?.cities.map((c) => (
            <Badge key={c.id} variant="outline" className="gap-1.5 pl-1">
              {c.name}
              <button onClick={() => deleteCity.mutate(c.id)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-2 text-sm text-muted-foreground flex items-center gap-1.5">
          <Waypoints className="w-4 h-4" /> المعابر الحدودية
        </h3>
        <div className="flex gap-2 mb-3">
          <Input value={newCrossing} onChange={(e) => setNewCrossing(e.target.value)} placeholder="اسم معبر جديد" />
          <Button onClick={() => newCrossing.trim() && addCrossing.mutate(newCrossing.trim())} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" /> إضافة
          </Button>
        </div>
        <div className="space-y-2">
          {crossings?.crossings.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <span className="text-sm font-medium">{c.name}</span>
                <Button
                  size="sm"
                  variant={c.status === "open" ? "outline" : "destructive"}
                  onClick={() => toggleCrossing.mutate({ id: c.id, status: c.status === "open" ? "closed" : "open" })}
                >
                  {c.status === "open" ? "مفتوح — إغلاق" : "مغلق — فتح"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const REPORT_REASON_LABELS: Record<string, string> = {
  unsafe_driving: "قيادة غير آمنة",
  inappropriate_behavior: "سلوك غير لائق",
  no_show: "لم يحضر للموعد",
  harassment: "مضايقة",
  fraud_or_scam: "احتيال",
  other: "سبب آخر",
};

function ReportsTab() {
  const { data, isLoading } = useAdmin<{ reports: Report[] }>("reports", "/admin/reports");
  const qc = useQueryClient();
  const { toast } = useToast();
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  const review = useMutation({
    mutationFn: ({ id, banReportedUser }: { id: number; banReportedUser: boolean }) =>
      api.post("/admin/reports/" + id + "/review", { note: noteMap[id], banReportedUser }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast({ title: "تمت مراجعة البلاغ" });
    },
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => api.post("/admin/reports/" + id + "/dismiss", { note: noteMap[id] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reports"] });
      toast({ title: "تم رفض البلاغ" });
    },
  });

  if (isLoading) return <Spinner className="w-6 h-6" />;
  const pending = data?.reports.filter((r) => r.status === "pending") ?? [];

  if (pending.length === 0) return <p className="text-muted-foreground text-sm py-8 text-center">لا يوجد بلاغات قيد المراجعة</p>;

  return (
    <div className="space-y-3">
      {pending.map((r) => (
        <Card key={r.id} className="border-destructive/30">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-4 h-4" /> {REPORT_REASON_LABELS[r.reason] ?? r.reason}
              </p>
              <span className="text-xs text-muted-foreground">مُبلِّغ #{r.reporterId} ← مُبلَّغ عنه #{r.reportedUserId}</span>
            </div>
            {r.details && <p className="text-sm bg-muted rounded p-2">{r.details}</p>}
            <Textarea
              placeholder="ملاحظة المراجعة (اختياري)"
              className="text-sm h-16 resize-none"
              value={noteMap[r.id] ?? ""}
              onChange={(e) => setNoteMap((p) => ({ ...p, [r.id]: e.target.value }))}
            />
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => dismiss.mutate(r.id)} disabled={dismiss.isPending}>
                رفض البلاغ
              </Button>
              <Button size="sm" onClick={() => review.mutate({ id: r.id, banReportedUser: false })} disabled={review.isPending}>
                تمت المراجعة
              </Button>
              <Button size="sm" variant="destructive" onClick={() => review.mutate({ id: r.id, banReportedUser: true })} disabled={review.isPending}>
                <Ban className="w-3.5 h-3.5 ml-1" /> حظر المستخدم المُبلَّغ عنه
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ModeratorsTab() {
  const { data, isLoading } = useAdmin<{ users: User[] }>("users", "/admin/users");
  const qc = useQueryClient();
  const { toast } = useToast();

  const setPermissions = useMutation({
    mutationFn: ({ id, permissions }: { id: number; permissions: string[] }) =>
      api.post("/admin/users/" + id + "/permissions", { permissions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({ title: "تم تحديث الصلاحيات" });
    },
  });

  if (isLoading) return <Spinner className="w-6 h-6" />;

  // الأدمن الكامل لا يحتاج صلاحيات مساعدة (يملك كل شيء أصلاً) — لا نعرضه هنا
  const candidates = data?.users.filter((u) => !u.isAdmin) ?? [];

  function togglePermission(u: User, perm: string) {
    const current = u.adminPermissions ?? [];
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    setPermissions.mutate({ id: u.id, permissions: next });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground bg-muted rounded-lg p-3">
        امنح مستخدمين محددين صلاحيات إدارية جزئية دون منحهم صلاحية الأدمن الكاملة. كل صلاحية مستقلة عن الأخرى، ويمكن سحبها في أي وقت.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">لا يوجد مستخدمون</p>
      ) : (
        <div className="space-y-3">
          {candidates.map((u) => {
            const perms = u.adminPermissions ?? [];
            return (
              <Card key={u.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email ?? u.telegramUsername ?? "—"}</p>
                    </div>
                    {perms.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {perms.length} صلاحية مفعّلة
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ADMIN_PERMISSIONS_LIST.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 text-xs border rounded-lg px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={perms.includes(perm)}
                          onChange={() => togglePermission(u, perm)}
                          disabled={setPermissions.isPending}
                        />
                        {ADMIN_PERMISSION_LABELS[perm]}
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { data: user, isLoading: userLoading } = useGetMe();
  const [, setLocation] = useLocation();

  if (userLoading) return <Spinner className="w-6 h-6" />;

  const permissions = user?.adminPermissions ?? [];
  const hasAnyAccess = user?.isAdmin || permissions.length > 0;

  if (!hasAnyAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-2xl font-bold">هذه الصفحة خاصة بالإدارة</h2>
        <Button onClick={() => setLocation("/")}>العودة للرئيسية</Button>
      </div>
    );
  }

  const can = (perm: string) => user!.isAdmin || permissions.includes(perm);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Users className="w-7 h-7 text-primary" /> لوحة الإدارة
        </h1>
        <p className="text-muted-foreground mt-1">
          {user!.isAdmin ? "إدارة المستخدمين، التوثيق، الرحلات، والكتالوج" : "لوحة إدارة مساعدة — صلاحيات محدودة"}
        </p>
      </div>

      <Tabs defaultValue={can("users") ? "users" : can("verifications") ? "verifications" : can("reports") ? "reports" : can("trips_bookings") ? "operations" : can("pricing") ? "pricing" : can("catalog") ? "catalog" : "moderators"}>
        <TabsList className="flex-wrap h-auto">
          {can("users") && <TabsTrigger value="users">المستخدمون</TabsTrigger>}
          {can("verifications") && <TabsTrigger value="verifications">طلبات التوثيق</TabsTrigger>}
          {can("reports") && <TabsTrigger value="reports">البلاغات</TabsTrigger>}
          {can("trips_bookings") && <TabsTrigger value="operations">الرحلات والحجوزات</TabsTrigger>}
          {can("pricing") && <TabsTrigger value="pricing">تقرير الأسعار</TabsTrigger>}
          {can("catalog") && <TabsTrigger value="catalog">المدن والمعابر</TabsTrigger>}
          {user!.isAdmin && <TabsTrigger value="moderators">المشرفون</TabsTrigger>}
        </TabsList>

        {can("users") && (
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
        )}
        {can("verifications") && (
          <TabsContent value="verifications" className="mt-4">
            <VerificationsTab />
          </TabsContent>
        )}
        {can("reports") && (
          <TabsContent value="reports" className="mt-4">
            <ReportsTab />
          </TabsContent>
        )}
        {can("trips_bookings") && (
          <TabsContent value="operations" className="mt-4">
            <OperationsTab />
          </TabsContent>
        )}
        {can("pricing") && (
          <TabsContent value="pricing" className="mt-4">
            <PricingTab />
          </TabsContent>
        )}
        {can("catalog") && (
          <TabsContent value="catalog" className="mt-4">
            <CatalogTab />
          </TabsContent>
        )}
        {user!.isAdmin && (
          <TabsContent value="moderators" className="mt-4">
            <ModeratorsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
