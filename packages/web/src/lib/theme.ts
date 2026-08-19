// وضع داكن يدوي — الألوان جاهزة أصلاً في index.css (.dark)، هذا فقط يفعّلها.
// مفيد فعلياً لمن يستخدم التطبيق ليلاً عند نقطة عبور: يريح العين ويوفر بطارية.

const STORAGE_KEY = "golog_theme";
export type Theme = "light" | "dark";

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // تجاهل
  }
  return "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // تجاهل
  }
}
