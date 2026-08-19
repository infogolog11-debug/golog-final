import { Minus, Plus } from "lucide-react";

/** عدّاد كبير بأزرار +/- بدل حقل رقمي صغير يحتاج كتابة — أسرع وأوضح باللمس */
export function SeatStepper({
  value,
  onChange,
  min = 1,
  max = 8,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-card-border bg-card px-4 py-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center disabled:opacity-40"
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="text-xl font-bold font-mono w-10 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
