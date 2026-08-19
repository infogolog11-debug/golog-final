export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export function getTier(points: number): LoyaltyTier {
  if (points >= 600) return "platinum";
  if (points >= 300) return "gold";
  if (points >= 100) return "silver";
  return "bronze";
}

export const TIER_CONFIG: Record<LoyaltyTier, {
  label: string; color: string; bg: string; border: string; icon: string; next: number | null;
}> = {
  bronze:   { label: "برونزي", color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",  icon: "🥉", next: 100 },
  silver:   { label: "فضي",    color: "text-slate-600",  bg: "bg-slate-50",   border: "border-slate-300",  icon: "🥈", next: 300 },
  gold:     { label: "ذهبي",   color: "text-yellow-600", bg: "bg-yellow-50",  border: "border-yellow-300", icon: "🥇", next: 600 },
  platinum: { label: "بلاتيني",color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-300", icon: "💎", next: null },
};
