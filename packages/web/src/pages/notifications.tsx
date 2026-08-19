import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Bell, BellOff, BookOpen, Car, MessageSquare, Star, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Notif = {
  id: number;
  type: "booking_created" | "booking_cancelled" | "new_message" | "trip_reminder" | "rating_received";
  title: string;
  body: string;
  isRead: boolean;
  relatedId: number | null;
  createdAt: string;
};

function typeIcon(type: Notif["type"]) {
  switch (type) {
    case "booking_created": return <Car className="w-5 h-5 text-green-600" />;
    case "booking_cancelled": return <BellOff className="w-5 h-5 text-red-500" />;
    case "new_message": return <MessageSquare className="w-5 h-5 text-blue-500" />;
    case "rating_received": return <Star className="w-5 h-5 text-yellow-500" />;
    default: return <Bell className="w-5 h-5 text-primary" />;
  }
}

function typeBg(type: Notif["type"]) {
  switch (type) {
    case "booking_created": return "bg-green-50 border-green-100";
    case "booking_cancelled": return "bg-red-50 border-red-100";
    case "new_message": return "bg-blue-50 border-blue-100";
    case "rating_received": return "bg-yellow-50 border-yellow-100";
    default: return "bg-muted/30";
  }
}

function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/notifications`, { credentials: "include" });
      if (!res.ok) return [] as Notif[];
      return res.json() as Promise<Notif[]>;
    },
    refetchInterval: 15000,
  });
}

export default function NotificationsPage() {
  const { data: notifs, isLoading } = useNotifications();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();

  const markOne = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${BASE}/api/notifications/${id}/read`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notif-unread"] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/notifications/read-all`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notif-unread"] });
      toast({ title: "تم تعليم كل الإشعارات كمقروءة" });
    },
  });

  const unreadCount = notifs?.filter(n => !n.isRead).length ?? 0;

  const handleClick = (n: Notif) => {
    if (!n.isRead) markOne.mutate(n.id);
    if (n.type === "booking_created" || n.type === "booking_cancelled") {
      setLocation("/driver");
    } else if (n.type === "new_message" && n.relatedId) {
      setLocation(`/messages`);
    } else if (n.type === "rating_received") {
      setLocation("/driver");
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="w-7 h-7" />
            الإشعارات
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{unreadCount} إشعار غير مقروء</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="w-4 h-4" />
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12"><Spinner className="w-8 h-8" /></div>
      ) : !notifs || notifs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-16 text-center text-muted-foreground space-y-3">
            <Bell className="w-12 h-12 text-muted-foreground/30" />
            <p className="font-medium text-base">لا يوجد إشعارات</p>
            <p className="text-sm">ستظهر هنا إشعارات الحجوزات والرسائل والتقييمات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifs.map(n => (
            <button
              key={n.id}
              className={`w-full text-right rounded-lg border p-4 transition-all hover:shadow-sm cursor-pointer ${
                n.isRead ? "bg-background border-border opacity-70" : typeBg(n.type)
              }`}
              onClick={() => handleClick(n)}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 rounded-full p-1.5 ${n.isRead ? "bg-muted" : "bg-white/80"}`}>
                  {typeIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-semibold ${n.isRead ? "text-muted-foreground" : "text-foreground"}`}>
                      {n.title}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary" />}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: ar })}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 text-right">{n.body}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
