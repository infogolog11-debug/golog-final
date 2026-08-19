import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const SECTIONS = [
  {
    title: "طبيعة الخدمة",
    body: "Golog منصة تعريف فقط: تربط بين سائقين وركاب، ومرسلي طرود وسائقين، بناءً على ما ينشره كل طرف. لسنا شركة نقل، ولا وسيطاً مالياً، ولا طرفاً في أي اتفاق سفر أو شحن يتم بين المستخدمين.",
  },
  {
    title: "لا معالجة دفع، ولا عمولة",
    body: "لا يعالج التطبيق أي دفعة مالية، ولا يأخذ أي عمولة على أي رحلة أو شحنة. أي اتفاق على السعر وطريقة الدفع يتم مباشرة وبشكل مستقل بين المستخدمين، وGolog ليس طرفاً فيه ولا مسؤولاً عنه.",
  },
  {
    title: "الحد الأدنى لسن استخدام الحساب",
    body: "يجب أن يكون عمرك 18 عاماً فأكثر لإنشاء حساب واستخدامه. لا يُسمح بأي حال بسفر قاصر عبر التطبيق دون رفقة فعلية من أحد أبويه أو وصيّه الشرعي على متن الرحلة نفسها — لا يوجد أي مسار لإرسال قاصر بمفرده.",
  },
  {
    title: "مسؤوليتك عند استخدام التطبيق",
    body: "أنت المسؤول عن التحقق من هوية وسلامة الطرف الذي تلتقي به، وعن قرارك بالسفر أو الشحن معه. آليات التوثيق والتقييم والإبلاغ في التطبيق أدوات مساعدة على بناء الثقة، وليست ضماناً لسلامة أي رحلة أو تعامل.",
  },
  {
    title: "السلوك غير المقبول",
    body: "يُمنع استخدام التطبيق لأي غرض احتيالي أو مخالف للقانون، أو لنقل مواد ممنوعة (كما هو موضح عند نشر طلبات الشحن)، أو لمضايقة أو إيذاء مستخدمين آخرين. الإدارة تحتفظ بحق حظر أي حساب يخالف ذلك، بناءً على مراجعة بلاغ أو دليل فعلي.",
  },
  {
    title: "توثيق السائقين",
    body: "شارة \"موثّق\" تعني فقط أن السائق قدّم وثيقة رخصة قيادة راجعها فريقنا شكلياً — وليست تزكية أو ضماناً لسلوكه أو مهارته في القيادة.",
  },
  {
    title: "تعديلات على هذه الشروط",
    body: "قد نحدّث هذه الشروط من وقت لآخر لتطوير الخدمة أو الالتزام بمتطلبات قانونية. استمرارك في استخدام التطبيق بعد أي تحديث يُعد قبولاً به.",
  },
];

export default function TermsPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="border-b border-border sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full h-8 w-8">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="font-display text-xl font-bold text-primary">شروط الاستخدام</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <p className="text-sm text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString("ar")}</p>
        {SECTIONS.map((s) => (
          <div key={s.title} className="space-y-2">
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
          </div>
        ))}
      </main>
    </div>
  );
}
