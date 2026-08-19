import { useMemo } from "react";
import { useLocation } from "wouter";
import { useConversations, useGetMe } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Package, Car } from "lucide-react";

function formatRelativeTime(dateString?: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "الآن";
  if (diffInSeconds < 3600) return Math.floor(diffInSeconds / 60) + " دقيقة";
  if (diffInSeconds < 86400) return Math.floor(diffInSeconds / 3600) + " ساعة";
  return Math.floor(diffInSeconds / 86400) + " يوم";
}

export default function MessagesPage() {
  const { data: user } = useGetMe();
  const { data: messages, isLoading } = useConversations();
  const [, setLocation] = useLocation();

  const conversations = useMemo(() => {
    if (!messages || !user) return [];
    const groups = new Map<
      string,
      { conversationType: "booking" | "parcel"; refId: number; lastMessage: string; lastMessageAt: string; unreadCount: number }
    >();

    for (const m of messages) {
      const refId = (m.bookingId ?? m.parcelId) as number;
      const key = m.conversationType + ":" + refId;
      const existing = groups.get(key);
      const isUnread = m.receiverId === user.id && !m.readAt;
      if (!existing) {
        groups.set(key, {
          conversationType: m.conversationType,
          refId,
          lastMessage: m.content,
          lastMessageAt: m.createdAt,
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        if (new Date(m.createdAt) > new Date(existing.lastMessageAt)) {
          existing.lastMessage = m.content;
          existing.lastMessageAt = m.createdAt;
        }
        if (isUnread) existing.unreadCount += 1;
      }
    }

    return Array.from(groups.values()).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  }, [messages, user]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">الرسائل</h1>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Spinner className="w-8 h-8" />
        </div>
      ) : conversations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <p>لا توجد محادثات بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {conversations.map((conv) => (
            <Card
              key={conv.conversationType + "-" + conv.refId}
              className="hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => setLocation("/messages/" + conv.conversationType + "/" + conv.refId)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    {conv.conversationType === "parcel" ? (
                      <Package className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Car className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="font-bold">{conv.conversationType === "parcel" ? "شحنة" : "حجز رحلة"} #{conv.refId}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate max-w-[250px] sm:max-w-md">{conv.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end space-y-1 shrink-0">
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(conv.lastMessageAt)}</span>
                  {conv.unreadCount > 0 && (
                    <Badge className="bg-amber-500 hover:bg-amber-600 text-white rounded-full h-5 min-w-5 flex items-center justify-center p-1 px-1.5 text-[10px]">
                      {conv.unreadCount}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
