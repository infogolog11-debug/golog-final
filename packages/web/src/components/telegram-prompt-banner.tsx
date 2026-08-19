import { useState } from "react";
import { useGetMe, useTelegramLinkCode } from "@/lib/queries";
import { Send, X } from "lucide-react";

const DISMISS_KEY = "golog_telegram_banner_dismissed";

/**
 * تذكير خفيف بربط تيليجرام للإشعارات — يظهر في أعلى صفحات الاستخدام
 * الأساسية (لا صفحة الحساب فقط) لأن الإشعار الفوري بقبول الحجز أو وصول
 * رمز اللقاء هو ما يجعل المستخدم يثق بأن "الحجز والنسيان" يعمل فعلاً.
 * يختفي فور الربط، ويمكن إغلاقه يدوياً (يبقى مغلقاً لهذه الجلسة).
 */
export function TelegramPromptBanner() {
  const { data: user } = useGetMe();
  const { data: telegramLink } = useTelegramLinkCode();
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "1");

  if (!user || user.telegramChatId || dismissed || !telegramLink) return null;

  const deepLink = "https://t.me/" + telegramLink.botUsername + "?start=" + telegramLink.code;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#229ED9]/30 bg-[#229ED9]/5 px-4 py-2.5 text-sm">
      <Send className="w-4 h-4 text-[#229ED9] shrink-0" />
      <p className="flex-1 text-foreground">اربط تيليجرام لتصلك إشعارات فورية بقبول حجزك — بدون فتح التطبيق باستمرار</p>
      <a href={deepLink} target="_blank" rel="noopener noreferrer" className="text-[#229ED9] font-medium underline shrink-0">
        ربط الآن
      </a>
      <button onClick={dismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
