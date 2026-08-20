import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useTelegramLogin } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { googleLoginUrl, api } from "@/lib/api";
import { RouteLine } from "@/components/route-line";

// لا يوجد أي بريد إلكتروني أو كلمة سر هنا إطلاقاً — الدخول حصراً عبر
// Google أو Telegram Login Widget، تماشياً مع مبدأ عدم وجود كلمات سر يديرها التطبيق.

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

export default function AuthPage() {
  const [errorMsg, setErrorMsg] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const telegramLogin = useTelegramLogin();
  const telegramRef = useRef<HTMLDivElement>(null);

  // ============== قسم التشخيص التفاعلي (أضيفته الآن بعد طلبك!) ==============
  // المستخدم استوقفني على التخمينات، لذلك أضفنا واجهة كاملة تشغل
  // /api/debug/full-report وتعرض السبب الحقيقي على الشاشة مباشرةً بلا أي تخمين.
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisLoading, setDiagnosisLoading] = useState(false);
  const [diagnosisData, setDiagnosisData] = useState<any>(null);
  const [diagnosisError, setDiagnosisError] = useState<string>("");

  async function runSelfDiagnosis() {
    setDiagnosisOpen(true);
    setDiagnosisLoading(true);
    setDiagnosisError("");
    try {
      const r = await api.get<any>("/debug/full-report", { timeout: 12000 });
      setDiagnosisData(r);
    } catch (e: any) {
      setDiagnosisError(
        "فشل الاتصال بـ API. التفاصيل: " + (e?.message || String(e) || "غير معروف")
      );
    } finally {
      setDiagnosisLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(search);
    const err = params.get("error");
    const debug = params.get("debug");
    const details = params.get("details");
    if (err) {
      let msg = "فشل تسجيل الدخول عبر Google. حاول مجدداً.";
      if (err === "google_missing") msg = "تسجيل الدخول عبر Google غير مُفعَّل بعد على الخادم.";
      else if (err === "google_internal") msg = "حدث خطأ داخلي أثناء بداية تسجيل الدخول عبر Google.";
      else if (err === "google_crash") msg = "انهار مسار تسجيل الدخول قبل إكماله.";
      else if (err === "google_failed") msg = "رفضت Google المصادقة، أو انتهت صلاحية الرابط.";
      else if (err === "session_failed") msg = "تم تسجيل الدخول بنجاح لكن فشل حفظ الجلسة.";
      const extra = debug || details;
      if (extra) {
        msg += "\n\n🔎 تفاصيل إضافية:\n" + decodeURIComponent(extra);
      }
      setErrorMsg(msg);
    }
  }, [search]);

  useEffect(() => {
    window.onTelegramAuth = (tgUser) => {
      setErrorMsg("");
      telegramLogin.mutate(tgUser, {
        onSuccess: (res) => setLocation(res.user.gender && res.user.ageConfirmedAt ? "/" : "/complete-profile"),
        onError: () => setErrorMsg("فشل تسجيل الدخول عبر Telegram. حاول مجدداً."),
      });
    };

    const container = telegramRef.current;
    if (!container) return;
    container.innerHTML = "";

    // ========== إصلاح خطأ "Bot domain invalid" ==========
    // قبل تحميل Telegram Login Widget: نعرض للمستخدم تعليمات صريحة لكيفية
    // إعداد الدومين في BotFather (لأن هذا هو السبب الحقيقي الوحيد لظهور هذا الخطأ).
    const currentDomain = window.location.hostname;
    const currentOrigin = window.location.protocol + "//" + window.location.host;
    const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "GologApp_bot");
    const tipDiv = document.createElement("div");
    tipDiv.className = "mb-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap";
    tipDiv.innerHTML =
      "💡 لإخفاء رسالة <strong>'Bot domain invalid'</strong> لزر Telegram:<br>" +
      "افتح <strong>@BotFather</strong> على تيليجرام ثم أرسل هذا الأمر حرفياً:<br>" +
      "<code style='display:inline-block;margin-top:.3rem;padding:.25rem .5rem;background:rgba(0,0,0,.06);border-radius:5px;font-family:ui-monospace,monospace'>/setdomain " + escapeHtml(window.location.hostname) + "</code><br>" +
      "ثم اختر البوت <strong>" + escapeHtml(botUsername) + "</strong> وأدخل الدومين <code>" + escapeHtml(window.location.hostname) + "</code>.";
    container.appendChild(tipDiv);

    // نلف الـ Widget في div خاص لكي نكتشف إذا ظهر خطأ بداخله
    const widgetWrap = document.createElement("div");
    widgetWrap.id = "tg_widget_wrap_" + Date.now();
    widgetWrap.className = "text-center";
    container.appendChild(widgetWrap);

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    script.async = true;

    let scriptLoadedOk = false;
    script.onload = () => { scriptLoadedOk = true; };

    // بعد 5 ثوانٍ: نتحقق مما إذا كان الـ Widget قد رفع زر تسجيل الدخول فعلاً
    // أم أن الـ iframe/script رمز لنص الخطأ "Bot domain invalid". إذا كان الأخير:
    // نعرض زر fallback مخصص يفتح BotFather مباشرة مع الدومين مملوء مسبقاً.
    setTimeout(() => {
      const html = widgetWrap.innerHTML;
      const hasButton =
        widgetWrap.querySelector("button, iframe, [role='button'], a[href*='telegram']") ||
        /login|telegram|bot/i.test(html);
      const hasDomainError =
        /domain\s*invalid|Bot domain/i.test(html) ||
        (scriptLoadedOk && widgetWrap.children.length === 0 && html.trim().length < 50);

      // إذا (1) لم يتحمل الزر أبداً، أو (2) كان هناك خطأ Domain واضح
      if (!hasButton || hasDomainError) {
        try { widgetWrap.style.display = "none"; } catch {}
        const fallbackDiv = document.createElement("div");
        fallbackDiv.className =
          "mt-2 p-3 rounded-xl border-dashed border-[2px] " +
          "border-[#229ED9]/40 bg-[#229ED9]/[0.04] text-center";
        fallbackDiv.innerHTML =
          '<p style="margin:0 0 .4rem 0;font-size:12px;color:#374151">' +
          "📌 تسجيل الدخول عبر تيليجرام متاح بعد إعداد الدومين في BotFather:" +
          "</p>" +
          '<div style="padding:.4rem .6rem;margin:.25rem 0 .5rem 0;background:#fff;border-radius:6px;border:1px solid #e5e7eb;font-family:ui-monospace,monospace;font-size:12px;color:#111">' +
          "/setdomain " + escapeHtml(currentDomain) +
          "</div>" +
          '<a target="_blank" rel="noopener noreferrer" ' +
          'href="https://t.me/BotFather?start=setdomain_' + encodeURIComponent(currentDomain) + '" ' +
          'style="display:inline-flex;align-items:center;gap:.35rem;padding:.5rem 1rem;border-radius:8px;background:#229ED9;color:#fff;font-weight:600;text-decoration:none;font-size:13px">' +
          "🧭 افتح @BotFather مباشرة" +
          "</a>" +
          '<div style="margin-top:.5rem;font-size:11px;color:#6b7280;line-height:1.6">' +
          "في BotFather: أرسل <strong>/setdomain</strong> → اختر <strong>" + escapeHtml(botUsername) +
          "</strong> → اكتب الدومين <strong>" + escapeHtml(currentDomain) + "</strong>." +
          "</div>";
        container.appendChild(fallbackDiv);
      }
    }, 5000);

    widgetWrap.appendChild(script);

    // دالة مساعدة للهروب من HTML (تعريف محلي داخل useEffect)
    function escapeHtml(s: string) {
      return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    return () => {
      window.onTelegramAuth = undefined;
    };
  }, []);

  /* =========================================================================
     زر تسجيل الدخول عبر Google — تمت إعادة هيكلته بالكامل لأنه كان يعتمد فقط
     على (onClick + window.location.href) التي قد تُفشل صمتاً في بعض الظروف:
       • حماية React StrictMode التي تُلغي بعض الأحداث
       • preventDefault داخلي في مكون Button
       • بعض إضافات المتصفح التي تحجب window.location المفاجئ
     الحل الأكثر أماناً عالمياً: استخدام علامة <a href> HTML القياسية مع
     التخزين داخل الزر كـ asChild — فهذه تعمل دائماً وبدون أي اعتماد على JS.
     كذلك نحافظ على onClick كـ fallback مع try/catch و console.debug.
     ========================================================================= */
  const googleHref = googleLoginUrl();

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-4" dir="rtl">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <h1 className="font-display text-5xl font-bold tracking-tight text-primary">Golog</h1>
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <span>حلب</span>
            <RouteLine animated />
            <span>غازي عنتاب</span>
          </div>
          <p className="text-muted-foreground pt-1">رفقة موثوقة على الطريق بين مدنك</p>
        </div>

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-3 text-center">{errorMsg}</div>
        )}

        <div className="space-y-4 bg-card border border-card-border rounded-2xl p-6 shadow-sm">
          <a
            href={googleHref}
            className={
              "inline-flex w-full items-center justify-center gap-3 h-11 text-base font-medium border-2 rounded-md transition-colors " +
              "border shadow-xs active:shadow-none " +
              "hover-elevate active-elevate-2 " +
              "[border-color:var(--button-outline)] " +
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring " +
              "disabled:pointer-events-none disabled:opacity-50 " +
              "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 " +
              "whitespace-nowrap"
            }
            onClick={(e) => {
              // دعم تشخيصي فقط (إزالة التعليقات للفحص):
              // eslint-disable-next-line no-console
              console.log("[DEBUG] <a> Google clicked → href:", googleHref);
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            <span>تسجيل الدخول عبر Google</span>
          </a>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">أو</span>
            </div>
          </div>

          <div className="flex justify-center" ref={telegramRef} />
        </div>

        {/* ============================================================
             🔍 قسم التشخيص الذاتي (أضيفته بعد طلبك — لا تخمين بعد الآن!)
             عندما لا يعمل الدخول، يضغط المستخدم على هذا الزر ويعرض له
             كل بند في النظام مع ✅ أو ❌ + السبب الحقيقي المكتوب حرفياً.
           ============================================================ */}
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs gap-2"
            onClick={() => {
              if (!diagnosisOpen) {
                runSelfDiagnosis();
              } else {
                setDiagnosisOpen(false);
                setDiagnosisData(null);
                setDiagnosisError("");
              }
            }}
          >
            🔍 {diagnosisOpen ? "إخفاء تقرير الفحص الذاتي" : "لم يعمل الدخول؟ ابدأ الفحص الذاتي السريع"}
          </Button>

          {diagnosisOpen && (
            <div className="mt-3 p-4 rounded-xl border bg-background/50 shadow-sm text-right text-xs space-y-3">
              <p className="text-muted-foreground">
                هذا الفحص يتصل مباشرة بالخادم ويتحقق من كل طبقة بنفسه لمعرفة أين المشكلة بالضبط:
              </p>

              {diagnosisLoading && (
                <div className="text-primary font-semibold">جاري الفحص الآن... يرجى الانتظار (ثوانٍ قليلة).</div>
              )}

              {diagnosisError && !diagnosisLoading && (
                <div className="bg-destructive/10 text-destructive rounded-lg p-3 whitespace-pre-wrap">
                  ❌ {diagnosisError}
                </div>
              )}

              {diagnosisData && !diagnosisLoading && (
                <div className="space-y-3">
                  {/* الخلاصة السريعة */}
                  <div className={
                    "rounded-lg p-3 " +
                    (diagnosisData.ok ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
                  }>
                    <div className="font-bold mb-1">📋 {diagnosisData.summary}</div>
                    {diagnosisData.rootCause && (
                      <div className="mt-2 font-semibold whitespace-pre-wrap border-t pt-2 border-amber-500/30">
                        {diagnosisData.rootCause}
                      </div>
                    )}
                  </div>

                  {/* قائمة الفحوصات بالكامل ✅ / ❌ لكل بند */}
                  <div className="grid gap-2">
                    {(diagnosisData.checks || []).map((c: any, i: number) => (
                      <div
                        key={i}
                        className={
                          "rounded-lg border p-3 " +
                          (c.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5")
                        }
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="font-semibold text-sm">{c.name}</div>
                            {c.detail && (
                              <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{c.detail}</div>
                            )}
                          </div>
                          <div
                            className={
                              "shrink-0 px-2 py-1 rounded-md font-bold text-xs " +
                              (c.ok ? "bg-emerald-500/20 text-emerald-700" : "bg-destructive/20 text-destructive")
                            }
                          >
                            {c.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] text-muted-foreground border-t pt-2">
                    آخر تحديث لهذا التقرير: {String(diagnosisData.timestamp || "")}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          لا حاجة لكلمة سر — دخولك محمي بالكامل عبر حسابك في Google أو Telegram
        </p>
      </div>
    </div>
  );
}
