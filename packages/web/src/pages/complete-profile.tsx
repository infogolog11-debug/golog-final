import { useState } from "react";
import { useLocation } from "wouter";
import { useUpdateProfile } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CompleteProfilePage() {
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [, setLocation] = useLocation();
  const updateProfile = useUpdateProfile();

  const canContinue = !!gender && ageConfirmed;

  const handleSubmit = () => {
    if (!canContinue) return;
    updateProfile.mutate(
      { gender, confirmAge: true } as any,
      {
        onSuccess: (res) => setLocation(res.user.currentRole === "driver" ? "/driver" : "/passenger"),
      },
    );
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-muted/30 p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-primary">Golog</h1>
          <p className="text-muted-foreground">أكمل ملفك الشخصي</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>اختر جنسك</CardTitle>
            <CardDescription>هذا مهم لعرض رحلات "نسائي وعائلي" وضمان راحتك</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setGender("male")}
                className={
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 p-6 transition-all cursor-pointer " +
                  (gender === "male" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40")
                }
              >
                <span className="text-4xl">👨</span>
                <span className="font-semibold text-lg">ذكر</span>
              </button>

              <button
                onClick={() => setGender("female")}
                className={
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 p-6 transition-all cursor-pointer " +
                  (gender === "female" ? "border-primary bg-primary/5 text-primary" : "border-muted hover:border-primary/40")
                }
              >
                <span className="text-4xl">👩</span>
                <span className="font-semibold text-lg">أنثى</span>
              </button>
            </div>

            <label className="flex items-start gap-2.5 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0"
              />
              <span>
                أقرّ بأن عمري 18 عاماً فأكثر، وأوافق على{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  شروط الاستخدام
                </a>{" "}
                و{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  سياسة الخصوصية
                </a>
              </span>
            </label>

            <Button className="w-full mt-2" onClick={handleSubmit} disabled={!canContinue || updateProfile.isPending}>
              {updateProfile.isPending ? "جاري الحفظ..." : "متابعة"}
            </Button>

            {updateProfile.isError && <p className="text-destructive text-sm text-center">حدث خطأ، حاول مجدداً</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
