import { Link, useLocation } from "wouter";
import { useSwitchRole } from "@/lib/queries";
import type { User } from "@/lib/types";
import { Button } from "./ui/button";
import { Car, User as UserIcon } from "lucide-react";

/**
 * رأس مبسّط للغاية عمداً: العلامة التجارية + مفتاح تبديل الدور فقط.
 * كل شيء آخر (رسائل، إشعارات، حجوزات، حساب) انتقل إلى شريط التنقّل
 * السفلي (bottom-nav.tsx) الذي يعمل بيد واحدة أثناء المشي أو الوقوف.
 */
export function Header({ user }: { user: User }) {
  const [, setLocation] = useLocation();
  const switchRole = useSwitchRole();
  const isDriver = user.currentRole === "driver";

  const handleSwitchRole = () => {
    const newRole = isDriver ? "passenger" : "driver";
    switchRole.mutate(newRole, {
      onSuccess: () => setLocation(newRole === "driver" ? "/driver" : "/passenger"),
    });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-4xl mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="font-display text-2xl font-bold tracking-tight text-primary">
          Golog
        </Link>

        <Button variant="outline" size="sm" onClick={handleSwitchRole} className="gap-2" disabled={switchRole.isPending}>
          {isDriver ? (
            <>
              <UserIcon className="h-4 w-4" />
              <span>وضع الراكب</span>
            </>
          ) : (
            <>
              <Car className="h-4 w-4" />
              <span>وضع السائق</span>
            </>
          )}
        </Button>
      </div>
    </header>
  );
}
