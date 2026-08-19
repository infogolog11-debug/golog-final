import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useUpdateProfile,
  useTelegramLinkCode,
  useMyVerification,
  useRequestUploadUrl,
  useSubmitVerification,
  useLogout,
  useDeleteAccount,
  qk,
} from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Phone,
  Send,
  CheckCircle2,
  ExternalLink,
  Award,
  Car,
  BadgeCheck,
  Clock,
  XCircle,
  AlertCircle,
  Upload,
  ShieldCheck,
  LogOut,
  LifeBuoy,
  Trash2,
} from "lucide-react";

// رقم واتساب الدعم — اضبطه عبر VITE_SUPPORT_WHATSAPP في بيئة الإنتاج
// (بصيغة دولية بدون + أو مسافات، مثال: 905551234567)
const SUPPORT_WHATSAPP_NUMBER = import.meta.env.VITE_SUPPORT_WHATSAPP || "905000000000";
import { getTier, TIER_CONFIG } from "@/lib/points-utils";
import { TierBadge } from "@/pages/points";
import { FONT_SCALES, applyFontScale, getFontScale, type FontScale } from "@/lib/font-scale";
import { applyTheme, getTheme, type Theme } from "@/lib/theme";

function DriverVerificationSection({ currentRole }: { currentRole: string }) {
  const { data: verification, isLoading } = useMyVerification();
  const requestUploadUrl = useRequestUploadUrl();
  const submitVerification = useSubmitVerification();
  const { toast } = useToast();

  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleInfo, setVehicleInfo] = useState("");
  const [documentObjectPath, setDocumentObjectPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { uploadUrl, objectPath } = await requestUploadUrl.mutateAsync();
      const res = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
      if (!res.ok) throw new Error("فشل رفع الملف");
      setDocumentObjectPath(objectPath);
      toast({ title: "تم رفع الوثيقة بنجاح" });
    } catch (err) {
      toast({ title: "فشل رفع الوثيقة", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  if (currentRole !== "driver" || isLoading) return null;

  const status = verification?.status;

  async function handleSubmit() {
    if (!licenseNumber.trim() || !documentObjectPath) {
      toast({ title: "أدخل رقم الرخصة وارفع صورة الوثيقة", variant: "destructive" });
      return;
    }
    await submitVerification.mutateAsync({ licenseNumber, vehicleInfo: vehicleInfo || undefined, documentObjectPath });
    toast({ title: "تم إرسال طلب التوثيق بنجاح", description: "سيراجعه الفريق قريباً" });
    setLicenseNumber("");
    setVehicleInfo("");
    setDocumentObjectPath(null);
  }

  return (
    <Card
      className={
        status === "approved"
          ? "border-blue-200 bg-blue-50/20"
          : status === "pending"
            ? "border-amber-200 bg-amber-50/20"
            : status === "rejected"
              ? "border-red-200 bg-red-50/10"
              : "border-border"
      }
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Car className="h-4 w-4" />
          توثيق السائق
          {status === "approved" && (
            <Badge className="bg-blue-100 text-blue-800 border-blue-200 gap-1 text-xs">
              <BadgeCheck className="w-3 h-3" /> موثّق
            </Badge>
          )}
          {status === "pending" && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1 text-xs">
              <Clock className="w-3 h-3" /> قيد المراجعة
            </Badge>
          )}
          {status === "rejected" && (
            <Badge className="bg-red-100 text-red-800 border-red-200 gap-1 text-xs">
              <XCircle className="w-3 h-3" /> مرفوض
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {status === "approved" ? "تم توثيق حسابك — شارة التوثيق ظاهرة لجميع الركاب" : "أدخل رقم رخصتك وارفع صورتها للحصول على شارة السائق الموثّق"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === "approved" ? (
          <p className="text-sm text-muted-foreground text-center">لتعديل البيانات أو سحب التوثيق، تواصل مع الدعم</p>
        ) : status === "pending" ? (
          <div className="rounded-md bg-amber-100/60 border border-amber-200 p-4 flex items-start gap-2">
            <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">طلبك قيد المراجعة</p>
              <p className="text-amber-700 text-xs mt-1">تم إرسال الطلب — سيتم إشعارك فور اتخاذ القرار</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {status === "rejected" && verification?.reviewerNote && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 flex items-start gap-2 text-sm">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-800">تم رفض الطلب السابق</p>
                  <p className="text-xs text-red-700 mt-1">السبب: {verification.reviewerNote}</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                رقم رخصة القيادة <span className="text-destructive">*</span>
              </label>
              <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="مثال: 12345678" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">معلومات المركبة</label>
              <Input value={vehicleInfo} onChange={(e) => setVehicleInfo(e.target.value)} placeholder="النوع، اللون، رقم اللوحة" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">صورة رخصة القيادة *</label>
              <label
                className={
                  "flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-4 cursor-pointer transition-colors text-xs text-center " +
                  (documentObjectPath ? "border-green-400 bg-green-50 text-green-700" : "border-muted-foreground/30 hover:border-primary/50 text-muted-foreground")
                }
              >
                {uploading ? (
                  <span className="animate-pulse">جاري الرفع...</span>
                ) : documentObjectPath ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    <span>تم رفع الصورة ✓</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 opacity-50" />
                    <span>اضغط للرفع</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={handleFileChange} />
              </label>
            </div>
            <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitVerification.isPending || uploading}>
              <BadgeCheck className="w-4 h-4" />
              {submitVerification.isPending ? "جاري الإرسال..." : "تقديم طلب التوثيق"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { data: user } = useGetMe();
  const updateProfile = useUpdateProfile();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { data: telegramLink } = useTelegramLinkCode();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [name, setName] = useState(user?.name ?? "");
  const [gender, setGender] = useState<"male" | "female">((user?.gender as "male" | "female") ?? "male");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [fontScale, setFontScale] = useState<FontScale>(getFontScale());
  const [theme, setTheme] = useState<Theme>(getTheme());

  if (!user) return null;

  const isLinked = !!user.telegramChatId;

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries();
        setLocation("/auth");
      },
      onError: () => {
        queryClient.removeQueries();
        setLocation("/auth");
      },
    });
  }

  function handleDeleteAccount() {
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        queryClient.removeQueries();
        setLocation("/auth");
      },
    });
  }
  const telegramDeepLink = telegramLink ? "https://t.me/" + telegramLink.botUsername + "?start=" + telegramLink.code : null;
  const hasChanges = name !== user.name || gender !== user.gender || phone !== (user.phone ?? "");

  function handleSave() {
    updateProfile.mutate(
      { name, gender, phone: phone || undefined },
      {
        onSuccess: () => toast({ title: "تم حفظ التغييرات بنجاح" }),
        onError: () => toast({ title: "فشل الحفظ", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الملف الشخصي</h1>
        <p className="text-muted-foreground mt-1">إدارة معلوماتك الشخصية</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" /> المعلومات الشخصية
          </CardTitle>
          <CardDescription>يمكنك تعديل اسمك وجنسك ورقم هاتفك</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium">الاسم</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الكامل" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Phone className="w-4 h-4" /> رقم الهاتف
            </label>
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="مثال: +90 555 123 4567" dir="ltr" type="tel" />
            <p className="text-xs text-muted-foreground">يظهر للركاب الذين يحجزون رحلاتك (إن كنت سائقاً)</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الجنس</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setGender("male")}
                className={
                  "flex items-center justify-center gap-2 rounded-lg border-2 py-3 transition-all cursor-pointer " +
                  (gender === "male" ? "border-primary bg-primary/5 text-primary font-semibold" : "border-muted hover:border-primary/40")
                }
              >
                <span>👨</span> ذكر
              </button>
              <button
                onClick={() => setGender("female")}
                className={
                  "flex items-center justify-center gap-2 rounded-lg border-2 py-3 transition-all cursor-pointer " +
                  (gender === "female" ? "border-primary bg-primary/5 text-primary font-semibold" : "border-muted hover:border-primary/40")
                }
              >
                <span>👩</span> أنثى
              </button>
            </div>
          </div>

          <Button className="w-full" onClick={handleSave} disabled={updateProfile.isPending || !hasChanges}>
            {updateProfile.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
          </Button>
        </CardContent>
      </Card>

      <DriverVerificationSection currentRole={user.currentRole} />

      {user.currentRole === "passenger" && (
        <Card className={"border-2 " + TIER_CONFIG[getTier(user.loyaltyPoints ?? 0)].border + " " + TIER_CONFIG[getTier(user.loyaltyPoints ?? 0)].bg}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Award className="h-4 w-4" />
              نقاط الولاء
            </CardTitle>
            <CardDescription>اجمع نقاطاً مع كل رحلة للوصول إلى مستويات أعلى</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-black">{user.loyaltyPoints ?? 0}</p>
                <p className="text-sm text-muted-foreground">نقطة</p>
              </div>
              <TierBadge points={user.loyaltyPoints ?? 0} />
            </div>
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setLocation("/points")}>
              عرض تفاصيل النقاط
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className={isLinked ? "border-green-200 bg-green-50/30" : "border-blue-200 bg-blue-50/20"}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="h-5 w-5 text-[#229ED9]" />
            إشعارات Telegram
            {isLinked && (
              <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                <CheckCircle2 className="w-3 h-3" /> مرتبط
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {isLinked ? "ستصلك الإشعارات مباشرة على Telegram فور حدوث أي نشاط" : "اربط حسابك بـ Telegram لتصلك الإشعارات فوراً على هاتفك"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isLinked && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              مهم خصوصاً لمستخدمي آيفون: بدون ربط تيليجرام لن تصلك أي إشعارات فورية بقبول حجزك أو وصول السائق.
            </p>
          )}
          {isLinked ? (
            <p className="text-sm text-green-700">✅ الحساب مرتبط بنجاح — يمكنك إلغاء الربط بإرسال /stop للبوت مباشرة</p>
          ) : telegramDeepLink ? (
            <div className="rounded-md border bg-background p-4 space-y-3">
              <p className="text-sm font-medium">افتح البوت واضغط START للربط التلقائي</p>
              <a
                href={telegramDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-[#229ED9] hover:bg-[#1a8bc4] text-white rounded-md py-2.5 px-4 text-sm font-medium transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                فتح البوت على Telegram
              </a>
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: qk.me });
                  toast({ title: "جاري التحقق من حالة الربط..." });
                }}
              >
                تحديث حالة الربط
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">جاري التحضير...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">المظهر</CardTitle>
          <CardDescription>يريح العين ويوفّر البطارية عند الاستخدام ليلاً</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                setTheme("light");
                applyTheme("light");
              }}
              className={
                "rounded-xl border-2 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 " +
                (theme === "light" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40")
              }
            >
              ☀️ فاتح
            </button>
            <button
              onClick={() => {
                setTheme("dark");
                applyTheme("dark");
              }}
              className={
                "rounded-xl border-2 py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2 " +
                (theme === "dark" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40")
              }
            >
              🌙 داكن
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">حجم الخط</CardTitle>
          <CardDescription>لجعل قراءة التطبيق أسهل</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {FONT_SCALES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setFontScale(s.value);
                  applyFontScale(s.value);
                }}
                className={
                  "rounded-xl border-2 py-3 text-sm font-semibold transition-colors " +
                  (fontScale === s.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:border-primary/40")
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">معلومات الحساب</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {user.email && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">البريد الإلكتروني</span>
              <span dir="ltr" className="font-mono">
                {user.email}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">الوضع الحالي</span>
            <span>{user.currentRole === "driver" ? "سائق" : "راكب"}</span>
          </div>
        </CardContent>
      </Card>

      {(user.isAdmin || (user.adminPermissions?.length ?? 0) > 0) && (
        <Button variant="outline" size="lg" className="w-full h-14 text-base gap-2" onClick={() => setLocation("/admin")}>
          <ShieldCheck className="w-5 h-5" /> {user.isAdmin ? "لوحة تحكم الإدارة" : "لوحة إدارة مساعدة"}
        </Button>
      )}

      <a
        href={"https://wa.me/" + SUPPORT_WHATSAPP_NUMBER + "?text=" + encodeURIComponent("مرحباً، أحتاج مساعدة في تطبيق Golog")}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full h-14 rounded-md border-2 text-base font-medium border-[#25D366]/40 text-[#128C4A] bg-[#25D366]/5 hover:bg-[#25D366]/10 transition-colors"
      >
        <LifeBuoy className="w-5 h-5" /> تواصل مع الدعم عبر واتساب
      </a>

      <Button
        variant="outline"
        size="lg"
        className="w-full h-14 text-base gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={handleLogout}
        disabled={logout.isPending}
      >
        <LogOut className="w-5 h-5" /> تسجيل الخروج
      </Button>

      <button
        onClick={() => setDeleteDialogOpen(true)}
        className="w-full text-center text-xs text-muted-foreground underline py-2 flex items-center justify-center gap-1"
      >
        <Trash2 className="w-3 h-3" /> حذف حسابي نهائياً
      </button>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive">حذف الحساب نهائياً</DialogTitle>
            <DialogDescription>
              سيُحذف اسمك وصورتك وبريدك ورقم هاتفك نهائياً، ولن تستطيع تسجيل الدخول بهذا الحساب مجدداً. هذا الإجراء لا يمكن التراجع عنه.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setDeleteDialogOpen(false)}>
              تراجع
            </Button>
            <Button variant="destructive" className="w-full sm:w-auto" disabled={deleteAccount.isPending} onClick={handleDeleteAccount}>
              {deleteAccount.isPending ? "جاري الحذف..." : "نعم، احذف حسابي"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
