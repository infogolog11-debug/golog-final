import { useLocation } from "wouter";
import { Search, Ticket, TrendingUp, MessageSquare, Bell, User } from "lucide-react";
import { useNotifications, useConversations } from "@/lib/queries";
import type { User as UserType } from "@/lib/types";

/**
 * شريط تنقّل سفلي ثابت — نفس نمط واتساب الذي يعرفه الجميع فعلاً بلا تعلّم.
 * أيقونات كبيرة + نص واضح، في منطقة يسهل الوصول إليها بالإبهام أثناء
 * الوقوف أو المشي. يستبدل قائمة الرأس المزدحمة بالكامل.
 */
export function BottomNav({ user }: { user: UserType }) {
  const [location, setLocation] = useLocation();
  const { data: notifications } = useNotifications();
  const { data: conversations } = useConversations();

  const unreadNotifs = notifications?.filter((n) => !n.isRead).length ?? 0;
  const unreadMessages = conversations?.filter((m) => m.receiverId === user.id && !m.readAt).length ?? 0;
  const isDriver = user.currentRole === "driver";

  const items = [
    {
      href: isDriver ? "/driver" : "/passenger",
      label: isDriver ? "رحلاتي" : "بحث",
      icon: Search,
      match: (l: string) => l === "/driver" || l === "/passenger" || l === "/",
    },
    {
      href: isDriver ? "/earnings" : "/bookings",
      label: isDriver ? "أرباحي" : "حجوزاتي",
      icon: isDriver ? TrendingUp : Ticket,
      match: (l: string) => l === "/earnings" || l === "/bookings",
    },
    {
      href: "/messages",
      label: "رسائل",
      icon: MessageSquare,
      match: (l: string) => l.startsWith("/messages"),
      badge: unreadMessages,
    },
    {
      href: "/notifications",
      label: "إشعارات",
      icon: Bell,
      match: (l: string) => l === "/notifications",
      badge: unreadNotifs,
    },
    {
      href: "/profile",
      label: "حسابي",
      icon: User,
      match: (l: string) => l === "/profile",
    },
  ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 bg-card border-t border-border flex items-stretch justify-around"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const active = item.match(location);
        const Icon = item.icon;
        return (
          <button
            key={item.href}
            onClick={() => setLocation(item.href)}
            className={
              "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 relative transition-colors " +
              (active ? "text-primary" : "text-muted-foreground")
            }
          >
            <span className="relative">
              <Icon className={"w-6 h-6" + (active ? " stroke-[2.3]" : "")} />
              {!!item.badge && (
                <span className="absolute -top-1 -left-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
