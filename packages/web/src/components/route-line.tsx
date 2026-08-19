/**
 * عنصر التوقيع البصري لـ Golog: خط طريق بين نقطتين — نقطة انطلاق ثابتة،
 * خط متقطع (كالخط المتوسط للطريق)، ونقطة وجهة. يحل محل السهم النصي "←"
 * في كل مكان يُعرض فيه "من ← إلى"، لأن هذا حرفياً ما يفعله التطبيق: يربط
 * نقطتين على خط سير. يتحرك بلطف (انزياح متقطع بطيء) ما لم يفضّل المستخدم
 * تقليل الحركة.
 */
export function RouteLine({ animated = false, className = "" }: { animated?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 12"
      className={"h-3 w-10 shrink-0 " + (animated ? "route-line-animated " : "") + className}
      aria-hidden="true"
    >
      <circle cx="4" cy="6" r="3.5" className="fill-primary" />
      <line
        x1="10"
        y1="6"
        x2="54"
        y2="6"
        stroke="currentColor"
        className="text-primary route-line-dashes"
        strokeWidth="2"
        strokeDasharray="1 6"
        strokeLinecap="round"
      />
      <circle cx="60" cy="6" r="3.5" className="fill-primary" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
