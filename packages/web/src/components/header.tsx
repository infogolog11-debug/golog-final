import { Link, useLocation } from "wouter";
import { useSwitchRole } from "@/lib/queries";
import type { User } from "@/lib/types";
import { Button } from "./ui/button";
import { Car, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * رأس مبسّط للغاية عمداً: العلامة التجارية + مفتاح تبديل الدور فقط.
 * كل شيء آخر (رسائل، إشعارات، حجوزات، حساب) انتقل إلى شريط التنقّل
 * السفلي (bottom-nav.tsx) الذي يعمل بيد واحدة أثناء المشي أو الوقوف.
 */
export function Header({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const switchRole = useSwitchRole();
  const { toast } = useToast();
  const isDriver = user.currentRole === "driver";

  const handleSwitchRole = () => {
    if (switchRole.isPending) return;
    const newRole = isDriver ? "passenger" : "driver";
    const roleAr = newRole === "driver" ? "السائق" : "الراكب";

    switchRole.mutate(newRole, {
      onSuccess: () => {
        toast({
          title: `تم التبديل إلى وضع ${roleAr}`,
          description: "جاري الانتقال إلى الصفحة المخصصة...",
        });
        setLocation(newRole === "driver" ? "/driver" : "/passenger");
      },
      onError: (e: any) => {
        // إذا كانت الخطأ 401 (غير مسجل) → عُد إلى صفحة الدخول
        if (e?.status === 401) {
          toast({
            title: "انتهت صلاحية الجلسة",
            description: "يرجى تسجيل الدخول مجدداً",
            variant: "destructive",
          });
          setLocation("/auth");
          return;
        }
        // 403 — مثلاً الحساب محظور
        if (e?.status === 403) {
          toast({
            title: "غير مسموح",
            description: e?.message || "هذا الحساب لا يملك صلاحية القيام بهذه العملية",
            variant: "destructive",
          });
          return;
        }
        // أي خطأ آخر → أظهر السبب الحقيقي إن وجد + كود الحالة
        const statusPart = e?.status ? ` (كود ${e.status})` : "";
        const msg = e?.message ? e.message : "حاول مرة أخرى بعد لحظات";
        toast({
          title: "تعذر تبديل الدور" + statusPart,
          description: msg,
          variant: "destructive",
        });
        console.error("[switch-role] ERROR:", e);
      },
    });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-4xl mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-primary">
          Golog
        </Link>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSwitchRole}
          className="gap-2"
          disabled={switchRole.isPending}
        >
          {switchRole.isPending ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
          ) : isDriver ? (
            <>
              <UserIcon className="h-4 w-4" />
              <span>وضع الراكب</span>
            </>
          ) : (
            <>
              <Car className="h-4 w-4" />
              <span>وضع السائق</span>
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
