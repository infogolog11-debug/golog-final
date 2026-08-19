import type { City } from "@/lib/types";

/**
 * شبكة أزرار كبيرة لاختيار مدينة بدل قائمة منسدلة — ضغطة واحدة مباشرة
 * بدل فتح/تمرير/قراءة قائمة. مصمم لجمهور يفضّل التعرّف البصري السريع
 * على القراءة والتمرير، ولاستخدام بإبهام واحد على الهاتف.
 */
export function CityPicker({
  cities,
  value,
  onChange,
  excludeCity,
}: {
  cities: City[];
  value: string;
  onChange: (city: string) => void;
  /** إخفاء مدينة معيّنة من القائمة (مثلاً نقطة الانطلاق المُختارة عند اختيار الوجهة) */
  excludeCity?: string;
}) {
  const visible = cities.filter((c) => c.name !== excludeCity);

  return (
    <div className="grid grid-cols-3 gap-2">
      {visible.map((city) => (
        <button
          key={city.id}
          type="button"
          onClick={() => onChange(city.name)}
          className={
            "rounded-xl border-2 py-3 px-2 text-sm font-semibold transition-colors " +
            (value === city.name
              ? "border-primary bg-primary/10 text-primary"
              : "border-card-border bg-card text-foreground hover:border-primary/40")
          }
        >
          {city.name}
        </button>
      ))}
    </div>
  );
}
