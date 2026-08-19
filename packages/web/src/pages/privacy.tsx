import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const SECTIONS = [
  {
    title: "ما هي البيانات التي نجمعها",
    body: "عند تسجيل الدخول عبر Google أو Telegram، نحصل على اسمك وصورتك وبريدك الإلكتروني (إن وُجد) أو اسم مستخدمك في تيليجرام. نطلب منك لاحقاً رقم هاتفك (ليظهر للطرف الآخر عند تأكيد حجز)، وجنسك (لتفعيل رحلات النسائي والعائلي بأمان). لا نطلب ولا نخزّن أي كلمة سر إطلاقاً.",
  },
  {
    title: "بيانات الرحلات والحجوزات",
    body: "نخزّن تفاصيل الرحلات التي تنشرها أو تحجزها (المدن، الأوقات، الأسعار التي تُدخلها بنفسك)، ورسائلك داخل التطبيق مع الطرف الآخر، وتقييماتك. عند رفع وثيقة توثيق كسائق، تُخزَّن في تخزين ملفات مستقل (Supabase Storage) ولا يراها إلا فريق المراجعة.",
  },
  {
    title: "الموقع الجغرافي",
    body: "لا نجمع موقعك الجغرافي إطلاقاً ولا نخزّنه على خوادمنا. ميزة مشاركة الموقع عبر واتساب تعمل بالكامل من متصفحك مباشرة إلى واتساب — نحن لا نرى ولا نحتفظ بهذا الموقع في أي لحظة.",
  },
  {
    title: "من يرى بياناتك",
    body: "اسمك وصورتك وتقييمك وشارة التوثيق (إن وُجدت) تظهر للطرف الآخر في أي حجز مشترك. رقم هاتفك يظهر فقط للطرف الآخر بعد تأكيد حجز فعلي، لا في نتائج البحث العامة. لا نبيع ولا نشارك بياناتك مع أي طرف ثالث لأغراض تسويقية.",
  },
  {
    title: "الإشعارات",
    body: "إن ربطت حسابك بتيليجرام، نرسل إشعارات عبره. في حالات محدودة وحرجة فقط (كقبول حجز أو وصول السائق) وعند عدم ربط تيليجرام، قد نرسل رسالة نصية قصيرة (SMS) إلى رقم هاتفك إن كان مسجَّلاً.",
  },
  {
    title: "حذف حسابك",
    body: "يمكنك حذف حسابك في أي وقت من صفحة الحساب. عند الحذف، تُستبدل بياناتك الشخصية (الاسم، الصورة، البريد، الهاتف) بقيم مجهَّلة بشكل نهائي، بينما يبقى سجل الرحلات والتقييمات الإحصائي (بدون ربطه باسمك) لضمان نزاهة تقييمات الأطراف الأخرى.",
  },
  {
    title: "الأمان",
    body: "الجلسات محمية عبر كوكي آمن، وكلمات المرور غير موجودة أصلاً في نظامنا. رموز اللقاء (OTP) محدودة بعدد محاولات صارم لمنع التخمين. نراجع البنية التقنية باستمرار لتقليل أي ثغرات.",
  },
  {
    title: "تواصل معنا",
    body: "لأي استفسار عن بياناتك أو لطلب حذفها يدوياً، تواصل معنا عبر زر \"تواصل مع الدعم\" في صفحة حسابك داخل التطبيق.",
  },
];

export default function PrivacyPage() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-[100dvh] bg-background" dir="rtl">
      <header className="border-b border-border sticky top-0 z-50 bg-background/95 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-full h-8 w-8">
            <ArrowRight className="h-4 w-4" />
          </Button>
          <span className="font-display text-xl font-bold text-primary">سياسة الخصوصية</span>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
        <p className="text-sm text-muted-foreground">آخر تحديث: {new Date().toLocaleDateString("ar")}</p>
        <p className="leading-relaxed">
          هذه الصفحة تشرح ببساطة ووضوح ما الذي يجمعه تطبيق Golog من بيانات، ولماذا، ومن يراها. هدفنا أن تفهمها فعلاً، لا فقط أن تمررها بسرعة.
        </p>
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
