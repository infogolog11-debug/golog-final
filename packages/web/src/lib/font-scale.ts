// تكبير حجم الخط عبر كل التطبيق — مفيد لجمهور قد يضم أعماراً أكبر سناً
// (مثل ولي أمر يحجز لابنه) بدون أي إعادة تصميم. يُخزَّن الاختيار محلياً
// ويُطبَّق فوراً على عنصر html بأكمله (يكبّر كل شيء نسبياً لأن التصميم
// مبني بوحدات rem).

const STORAGE_KEY = "golog_font_scale";
export const FONT_SCALES = [
  { value: "100", label: "عادي" },
  { value: "115", label: "كبير" },
  { value: "130", label: "أكبر" },
] as const;

export type FontScale = (typeof FONT_SCALES)[number]["value"];

export function getFontScale(): FontScale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && FONT_SCALES.some((s) => s.value === stored)) return stored as FontScale;
  } catch {
    // تجاهل
  }
  return "100";
}

export function applyFontScale(scale: FontScale) {
  document.documentElement.style.fontSize = scale + "%";
  try {
    localStorage.setItem(STORAGE_KEY, scale);
  } catch {
    // تجاهل
  }
}
