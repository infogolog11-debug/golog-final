import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { format } from "date-fns";
import { Award, Zap, Star, TrendingUp, Gift, Copy, Check, Share2, Users } from "lucide-react";
import { useState } from "react";
import type { LoyaltyTier } from "@/lib/points-utils";
import { getTier, TIER_CONFIG } from "@/lib/points-utils";
import { useMyPoints, useMyReferralCode } from "@/lib/queries";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

const REASON_LABELS: Record<string, string> = {
  referral: "إحالة صديق",
  booking_completed: "حجز رحلة مكتمل",
  parcel_completed: "شحنة مكتملة",
  rating_given: "تقديم تقييم",
  admin_bonus: "مكافأة من الإدارة",
  admin_deduction: "خصم من الإدارة",
};

const REASON_ICONS: Record<string, React.ReactNode> = {
  referral: <Users className="w-4 h-4 text-primary" />,
  booking_completed: <Zap className="w-4 h-4 text-primary" />,
  parcel_completed: <Zap className="w-4 h-4 text-primary" />,
  rating_given: <Star className="w-4 h-4 text-yellow-500" />,
  admin_bonus: <Gift className="w-4 h-4 text-green-500" />,
  admin_deduction: <Gift className="w-4 h-4 text-red-500" />,
};

interface ReferralData {
  code: string;
  totalReferred: number;
  bonusEarned: number;
  bonusCount: number;
}

function useReferrals() {
  return useQuery<ReferralData>({
    queryKey: ["referrals", "my-code", "full"],
    queryFn: () => api.get("/referrals/my-code"),
  });
}

export function TierBadge({ points, small }: { points: number; small?: boolean }) {
  const tier = getTier(points);
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium " +
        cfg.bg + " " + cfg.border + " " + cfg.color + " " + (small ? "text-xs" : "text-sm")
      }
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ReferralSection() {
  const { data: ref } = useReferrals();
  const [copied, setCopied] = useState(false);

  if (!ref) return null;

  const shareText = "انضم إلى Golog — رحلات مشتركة بين المدن. استخدم كود الإحالة: " + ref.code;

  function copyCode() {
    navigator.clipboard.writeText(ref!.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareViaWhatsApp() {
    window.open("https://wa.me/?text=" + encodeURIComponent(shareText), "_blank", "noopener,noreferrer");
  }

  function shareCode() {
    if (navigator.share) {
      navigator.share({ title: "Golog — كود الإحالة", text: shareText });
    } else {
      navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> ادعُ أصدقاءك
        </CardTitle>
        <CardDescription>احصل على نقاط عند انضمام أصدقائك عبر كودك</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-white border-2 border-primary/20 rounded-lg px-4 py-2.5 text-center font-mono text-xl font-black tracking-widest text-primary">
            {ref.code}
          </div>
          <Button size="sm" variant="outline" onClick={copyCode} className="gap-1.5 shrink-0">
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? "تم!" : "نسخ"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={shareViaWhatsApp}
            className="flex items-center justify-center gap-1.5 text-sm font-semibold text-white bg-[#25D366] rounded-lg py-2.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
              <path d="M21.05 3.16 2.9 10.36c-1.24.5-1.23 1.2-.23 1.5l4.65 1.45 1.8 5.5c.22.6.37.83.75.83.3 0 .44-.14.6-.3l1.7-1.65 4.72 3.5c.6.4 1.05.2 1.2-.55l2.9-13.7c.24-1-.35-1.4-1.14-1.08z" />
            </svg>
            مشاركة عبر واتساب
          </button>
          <Button size="sm" variant="outline" onClick={shareCode} className="gap-1.5 shrink-0">
            <Share2 className="w-4 h-4" />
            طرق أخرى
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-white/60 border p-3 text-center">
            <p className="text-2xl font-black text-primary">{ref.totalReferred}</p>
            <p className="text-xs text-muted-foreground mt-0.5">صديق انضم</p>
          </div>
          <div className="rounded-lg bg-white/60 border p-3 text-center">
            <p className="text-2xl font-black text-green-600">{ref.bonusEarned}</p>
            <p className="text-xs text-muted-foreground mt-0.5">نقطة مكافأة ربحتها</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PointsPage() {
  const { data, isLoading } = useMyPoints();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  const totalPoints = data?.totalPoints ?? 0;
  const tier = getTier(totalPoints);
  const cfg = TIER_CONFIG[tier];
  const nextTier = cfg.next;
  const progress = nextTier ? Math.min(100, Math.round((totalPoints / nextTier) * 100)) : 100;
  const transactions = (data?.transactions ?? []) as {
    id: number;
    points: number;
    reason: string;
    note: string | null;
    createdAt: string;
  }[];

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Award className="w-7 h-7 text-primary" />
          نقاط الولاء
        </h1>
        <p className="text-muted-foreground mt-1">اجمع نقاطاً مع كل رحلة وارتقِ إلى مستوى أعلى</p>
      </div>

      <Card className={"border-2 " + cfg.border + " " + cfg.bg + " overflow-hidden"}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">إجمالي نقاطك</p>
              <p className="text-5xl font-black mt-1 tabular-nums">{totalPoints}</p>
              <p className="text-sm text-muted-foreground mt-1">نقطة</p>
            </div>
            <div className="text-center">
              <div className="text-6xl">{cfg.icon}</div>
              <p className={"text-base font-bold mt-1 " + cfg.color}>{cfg.label}</p>
            </div>
          </div>

          {nextTier && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{totalPoints} نقطة</span>
                <span>{nextTier} نقطة للمستوى التالي</span>
              </div>
              <div className="h-2.5 bg-white/60 rounded-full overflow-hidden border">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-primary to-primary/60 transition-all duration-500"
                  style={{ width: progress + "%" }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                يتبقى <strong>{nextTier - totalPoints}</strong> نقطة للوصول إلى المستوى التالي
              </p>
            </div>
          )}
          {!nextTier && <p className="text-center text-sm font-medium text-violet-700 mt-2">💎 وصلت للمستوى الأعلى — بلاتيني!</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> مستويات الولاء
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {(Object.entries(TIER_CONFIG) as [LoyaltyTier, (typeof TIER_CONFIG)[LoyaltyTier]][]).map(([t, c]) => (
              <div key={t} className={"rounded-lg border p-3 flex items-center gap-2 " + (t === tier ? c.bg + " " + c.border : "opacity-50")}>
                <span className="text-2xl">{c.icon}</span>
                <div>
                  <p className={"text-sm font-semibold " + c.color}>{c.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {t === "platinum" ? "600+ نقطة" : t === "gold" ? "300–599 نقطة" : t === "silver" ? "100–299 نقطة" : "0–99 نقطة"}
                  </p>
                </div>
                {t === tier && <Badge className="mr-auto text-xs px-1.5">أنت هنا</Badge>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <ReferralSection />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">سجل النقاط</CardTitle>
          <CardDescription>آخر المعاملات</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-6 text-sm">لا يوجد معاملات بعد — احجز رحلتك الأولى لتبدأ بجمع النقاط!</p>
          ) : (
            <div className="divide-y">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      {REASON_ICONS[tx.reason] ?? <Award className="w-4 h-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{REASON_LABELS[tx.reason] ?? tx.note ?? tx.reason}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(tx.createdAt), "dd/MM/yyyy HH:mm")}</p>
                    </div>
                  </div>
                  <Badge className={"font-bold border " + (tx.points >= 0 ? "bg-primary/10 text-primary border-primary/20" : "bg-red-50 text-red-600 border-red-200")}>
                    {tx.points >= 0 ? "+" : ""}
                    {tx.points}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => setLocation("/passenger")}>
        العودة لصفحة الراكب
      </Button>
    </div>
  );
}
