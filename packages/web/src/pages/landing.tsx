import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { RouteLine } from "@/components/route-line";
import {
  Car,
  Users,
  ShieldCheck,
  Package,
  Heart,
  KeyRound,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";

const FEATURES = [
  {
    icon: Car,
    title: "انشر رحلتك أو ابحث عن واحدة",
    desc: "سائق لديك مقاعد فارغة؟ انشرها. راكب تبحث عن خط سير معيّن؟ اطلبه — وسيصلك إشعار فور توفّر رحلة مطابقة.",
  },
  {
    icon: Heart,
    title: "رحلات نسائية وعائلية",
    desc: "تبويب مستقل بالكامل: سائقات موثوقات، أو سائق وافقت عليه الإدارة خصيصاً لهذا النوع من الرحلات. لا يسافر أي قاصر إلا برفقة أحد الأبوين أو وصيّه فعلياً ضمن الرحلة.",
  },
  {
    icon: Package,
    title: "شحن طرود خفيفة",
    desc: "أرسل طرداً مع سائق ذاهب على نفس الخط — لا حاجة أن يملك المستلم حساباً، فقط اسمه ورقم هاتفه.",
  },
  {
    icon: KeyRound,
    title: "رمز يثبت أنكما التقيتما فعلاً",
    desc: "عند تأكيد الحجز يحصل الراكب على رمز من 4 أرقام يُعطيه للسائق عند اللقاء — لا يُغلق الحجز حتى يتأكد اللقاء الفعلي.",
  },
];

const TRUST_POINTS = [
  { icon: ShieldCheck, text: "سائقون يمكنهم توثيق هويتهم برخصة القيادة" },
  { icon: MessageCircle, text: "تواصل مباشر مع الطرف الآخر قبل الرحلة" },
  { icon: KeyRound, text: "لا يكتمل أي حجز أو شحنة بدون تأكيد اللقاء الفعلي" },
];

const FAQ = [
  {
    q: "هل التطبيق مجاني؟",
    a: "نعم. Golog لا يأخذ أي عمولة ولا يعالج أي دفعة مالية — الاتفاق على السعر والدفع يتم مباشرة بينك وبين الطرف الآخر.",
  },
  {
    q: "كيف أسجّل الدخول؟",
    a: "عبر حساب Google أو Telegram فقط — لا توجد كلمة سر يديرها التطبيق ولا يطلبها أحد منك أبداً.",
  },
  {
    q: "كيف أعرف أن السائق موثوق؟",
    a: "يمكن للسائق تقديم رخصة قيادته للتوثيق (شارة تظهر للجميع)، وتُعرض تقييمات وعدد الرحلات المكتملة لكل سائق بعد أول رحلات المنصة.",
  },
  {
    q: "ماذا لو لم أجد رحلة على خطي؟",
    a: "انشر طلب رحلة بخط سيرك وموعدك المفضّل — سيصلك إشعار فوري إذا نشر أي سائق عرضاً مطابقاً لاحقاً.",
  },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col" dir="rtl">
      <header className="border-b border-border sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-display text-2xl font-bold tracking-tight text-primary">Golog</span>
          <Button size="sm" onClick={() => setLocation("/auth")}>
            تسجيل الدخول
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 py-14 md:py-20 text-center space-y-6">
          <div className="flex items-center justify-center gap-3 text-muted-foreground">
            <span className="text-lg font-medium">حلب</span>
            <RouteLine animated className="h-4 w-16" />
            <span className="text-lg font-medium">غازي عنتاب</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            رفقة موثوقة على الطريق <span className="text-primary">بين مدنك</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Golog يربط السائقين والركاب بين المدن السورية والتركية — رحلات مشتركة، شحن طرود خفيفة، وتأكيد لقاء فعلي بدل الثقة العمياء.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button size="lg" className="gap-2 text-base px-8" onClick={() => setLocation("/auth")}>
              ابدأ الآن
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>

          <p className="text-sm text-muted-foreground pt-1">دخول فوري عبر Google أو Telegram — بدون كلمة سر، وبدون أي رسوم</p>
        </section>

        <section className="bg-muted/40 border-y border-border py-10">
          <div className="max-w-3xl mx-auto px-4 grid sm:grid-cols-3 gap-6">
            {TRUST_POINTS.map((t) => (
              <div key={t.text} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <t.icon className="w-4.5 h-4.5 text-accent" />
                </div>
                <p className="text-sm text-foreground leading-relaxed pt-1.5">{t.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 py-16 space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold">كل ما تحتاجه في مكان واحد</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-card-border bg-card p-6 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-muted/40 border-y border-border py-16">
          <div className="max-w-3xl mx-auto px-4 space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">أسئلة شائعة</h2>
            </div>
            <div className="space-y-5">
              {FAQ.map((f) => (
                <div key={f.q} className="space-y-1.5">
                  <h3 className="font-semibold">{f.q}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-3xl mx-auto px-4 py-16 text-center space-y-6">
          <h2 className="text-3xl font-bold">جاهز تنشر أول رحلة أو أول طلب؟</h2>
          <p className="text-muted-foreground">يستغرق التسجيل أقل من دقيقة</p>
          <Button size="lg" className="gap-2 text-base px-10" onClick={() => setLocation("/auth")}>
            ابدأ الآن
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setLocation("/privacy")} className="hover:text-foreground underline">
            سياسة الخصوصية
          </button>
          <button onClick={() => setLocation("/terms")} className="hover:text-foreground underline">
            شروط الاستخدام
          </button>
        </div>
        <p>© {new Date().getFullYear()} Golog</p>
      </footer>
    </div>
  );
}
