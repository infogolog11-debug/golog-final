import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useConversationMessages, useSendMessage, useGetMe, useRequestVoiceUploadUrl, useVoiceUrl } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Send, ArrowRight, Mic, Square, Play, Pause } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

const VOICE_PREFIX = "[voice]";

function VoiceMessagePlayer({ objectPath, isMe }: { objectPath: string; isMe: boolean }) {
  const { data, isLoading } = useVoiceUrl(objectPath);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  }

  if (isLoading || !data) {
    return <Spinner className="w-4 h-4" />;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        className={"w-8 h-8 rounded-full flex items-center justify-center shrink-0 " + (isMe ? "bg-primary-foreground/20" : "bg-primary/15")}
      >
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
      </button>
      <span className="text-xs">رسالة صوتية</span>
      <audio
        ref={audioRef}
        src={data.url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const conversationType = (params.conversationType as "booking" | "parcel") || "booking";
  const refId = parseInt(params.refId || "0", 10);
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const { toast } = useToast();

  const [content, setContent] = useState("");
  const [recording, setRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data: messages, isLoading } = useConversationMessages(conversationType, refId);
  const sendMessage = useSendMessage();
  const requestVoiceUploadUrl = useRequestVoiceUploadUrl();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    sendMessage.mutate(
      {
        conversationType,
        bookingId: conversationType === "booking" ? refId : undefined,
        parcelId: conversationType === "parcel" ? refId : undefined,
        content: content.trim(),
      },
      { onSuccess: () => setContent("") },
    );
  };

  // تسجيل صوتي بالضغط المطوّل — نمط واتساب: اضغط واستمر بالضغط للتسجيل، ارفع إصبعك للإرسال
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 500) return; // تسجيل قصير جداً على الأغلب بالخطأ — تجاهله

        try {
          const { uploadUrl, objectPath } = await requestVoiceUploadUrl.mutateAsync({ conversationType, refId });
          const res = await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "audio/webm" } });
          if (!res.ok) throw new Error("فشل الرفع");
          sendMessage.mutate({
            conversationType,
            bookingId: conversationType === "booking" ? refId : undefined,
            parcelId: conversationType === "parcel" ? refId : undefined,
            content: VOICE_PREFIX + objectPath,
          });
        } catch {
          toast({ title: "فشل إرسال الرسالة الصوتية", variant: "destructive" });
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast({ title: "تعذّر الوصول للميكروفون", description: "تحقق من صلاحية الميكروفون في المتصفح", variant: "destructive" });
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  return (
    <Card className="flex flex-col h-[calc(100dvh-14.5rem)] border-primary/20">
      <CardHeader className="bg-primary/5 pb-4 border-b flex-row items-center gap-4 py-3 px-4 space-y-0">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/messages")} className="shrink-0 rounded-full h-8 w-8">
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <CardTitle className="text-lg">المحادثة</CardTitle>
          <p className="text-sm text-muted-foreground">{conversationType === "parcel" ? "شحنة" : "حجز رحلة"} #{refId}</p>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spinner className="w-6 h-6" />
          </div>
        ) : !messages || messages.length === 0 ? (
          <div className="flex justify-center items-center h-full text-muted-foreground">ابدأ المحادثة</div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const isVoice = msg.content.startsWith(VOICE_PREFIX);
            return (
              <div key={msg.id} className={"flex flex-col max-w-[80%] " + (isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                <div
                  className={
                    "px-4 py-2 rounded-2xl " +
                    (isMe ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm")
                  }
                >
                  {isVoice ? (
                    <VoiceMessagePlayer objectPath={msg.content.slice(VOICE_PREFIX.length)} isMe={isMe} />
                  ) : (
                    <p className="text-sm break-words whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 px-1">{format(new Date(msg.createdAt), "HH:mm")}</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      <div className="p-3 border-t bg-background">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="اكتب رسالة..."
            className="flex-1 rounded-full bg-muted/50 border-0 focus-visible:ring-1 focus-visible:bg-background"
            dir="auto"
          />
          {content.trim() ? (
            <Button type="submit" size="icon" disabled={sendMessage.isPending} className="rounded-full shrink-0 h-10 w-10 bg-primary hover:bg-primary/90">
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <button
              type="button"
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={() => recording && stopRecording()}
              className={
                "rounded-full shrink-0 h-10 w-10 flex items-center justify-center transition-colors " +
                (recording ? "bg-destructive text-white animate-pulse" : "bg-primary text-primary-foreground")
              }
              title="اضغط مطوّلاً للتسجيل الصوتي"
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
        </form>
        {recording && <p className="text-[11px] text-destructive text-center mt-1.5">جاري التسجيل... ارفع إصبعك للإرسال</p>}
      </div>
    </Card>
  );
}
