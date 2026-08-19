import { useLocation } from "wouter";
import { useGetMe, useMyEarnings } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TrendingUp, Car, Package, DollarSign, Users } from "lucide-react";

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={"rounded-xl p-3 " + (color ?? "bg-primary/10")}>{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EarningsPage() {
  const { data: user } = useGetMe();
  const { data, isLoading } = useMyEarnings();
  const [, setLocation] = useLocation();

  if (user?.currentRole !== "driver") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h2 className="text-2xl font-bold">هذه الصفحة خاصة بالسائقين</h2>
        <Button onClick={() => setLocation("/passenger")}>العودة للوحة الراكب</Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center p-12">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-primary" />
            لوحة الأرباح
          </h1>
          <p className="text-muted-foreground mt-1">عرض وتتبع فقط — لا يوجد أي معالجة دفع فعلية داخل التطبيق</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLocation("/driver")}>
          العودة للوحة السائق
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-5 h-5 text-green-600" />} label="إجمالي المحصّل" value={String(data.total)} color="bg-green-100" />
        <StatCard
          icon={<Users className="w-5 h-5 text-blue-600" />}
          label="من الركاب"
          value={String(data.passengerEarnings)}
          sub={data.completedRidesCount + " رحلة مكتملة"}
          color="bg-blue-100"
        />
        <StatCard
          icon={<Package className="w-5 h-5 text-violet-600" />}
          label="من الطرود"
          value={String(data.parcelEarnings)}
          sub={data.deliveredParcelsCount + " شحنة مسلَّمة"}
          color="bg-violet-100"
        />
        <StatCard icon={<Car className="w-5 h-5 text-primary" />} label="إجمالي العمليات" value={String(data.completedRidesCount + data.deliveredParcelsCount)} color="bg-primary/10" />
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ملاحظة</CardTitle>
          <CardDescription>
            هذه الأرقام مبنية على الأسعار التي أدخلتها بنفسك عند نشر الرحلات والشحنات — Golog لا يعالج أي دفعة فعلية،
            والتحصيل يتم مباشرة بينك وبين الراكب/المرسل.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
