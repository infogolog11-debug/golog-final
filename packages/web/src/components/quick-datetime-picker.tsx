import { useState } from "react";
import { format } from "date-fns";

const DAY_OPTIONS = [
  { label: "اليوم", offset: 0 },
  { label: "غداً", offset: 1 },
  { label: "بعد غد", offset: 2 },
];

const TIME_OPTIONS = [
  { label: "صباحاً", hour: 8 },
  { label: "ظهراً", hour: 12 },
  { label: "عصراً", hour: 16 },
  { label: "مساءً", hour: 20 },
];

/**
 * اختيار وقت بسيط بضغطتين (يوم + فترة يوم) بدل حقل تقويم/ساعة معقّد —
 * هكذا يفكّر الناس فعلياً بمواعيد السفر. مع خيار "وقت دقيق" مطوي لمن
 * يحتاج تحديداً أدق، بلا حذف القدرة تماماً.
 */
export function QuickDateTimePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [dayOffset, setDayOffset] = useState<number | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [showPrecise, setShowPrecise] = useState(false);

  function applyQuick(newDayOffset: number | null, newHour: number | null) {
    setDayOffset(newDayOffset);
    setHour(newHour);
    if (newDayOffset === null || newHour === null) return;
    const d = new Date();
    d.setDate(d.getDate() + newDayOffset);
    d.setHours(newHour, 0, 0, 0);
    onChange(d.toISOString());
  }

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-2">
        {DAY_OPTIONS.map((d) => (
          <button
            key={d.label}
            type="button"
            onClick={() => applyQuick(d.offset, hour)}
            className={
              "rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors " +
              (dayOffset === d.offset ? "border-primary bg-primary/10 text-primary" : "border-card-border bg-card hover:border-primary/40")
            }
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {TIME_OPTIONS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => applyQuick(dayOffset, t.hour)}
            className={
              "rounded-xl border-2 py-2.5 text-xs font-semibold transition-colors " +
              (hour === t.hour ? "border-primary bg-primary/10 text-primary" : "border-card-border bg-card hover:border-primary/40")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {value && !showPrecise && (
        <p className="text-xs text-muted-foreground text-center">
          الموعد: <span className="font-semibold text-foreground">{format(new Date(value), "eeee dd/MM · HH:mm")}</span>
        </p>
      )}

      <button type="button" onClick={() => setShowPrecise((v) => !v)} className="text-xs text-primary underline block mx-auto">
        {showPrecise ? "إخفاء" : "تحديد وقت دقيق بدلاً من ذلك"}
      </button>

      {showPrecise && (
        <input
          type="datetime-local"
          value={value ? value.slice(0, 16) : ""}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(new Date(e.target.value).toISOString());
            setDayOffset(null);
            setHour(null);
          }}
          className="w-full text-sm rounded-lg border border-card-border px-3 py-2"
        />
      )}
    </div>
  );
}
