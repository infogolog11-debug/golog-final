import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { useGetMe } from "@/lib/queries";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { ActiveTripBanner } from "@/components/active-trip-banner";
import LandingPage from "@/pages/landing";
import PrivacyPage from "@/pages/privacy";
import TermsPage from "@/pages/terms";
import AuthPage from "@/pages/auth";
import DriverPage from "@/pages/driver";
import PassengerPage from "@/pages/passenger";
import BookingsPage from "@/pages/bookings";
import MessagesPage from "@/pages/messages";
import ChatPage from "@/pages/chat";
import CompleteProfilePage from "@/pages/complete-profile";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin";
import NotificationsPage from "@/pages/notifications";
import EarningsPage from "@/pages/earnings";
import PointsPage from "@/pages/points";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";

const queryClient = new QueryClient();

const PROTECTED_ROUTES = [
  "/passenger",
  "/driver",
  "/bookings",
  "/messages",
  "/profile",
  "/admin",
  "/notifications",
  "/earnings",
  "/points",
  "/complete-profile",
];

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/"));
}

function AppContent() {
  const { data: rawUser, isLoading } = useGetMe({ retry: false });
  const [location, setLocation] = useLocation();

  const user =
    rawUser && typeof (rawUser as any).id === "number" ? rawUser : null;
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      if (location === "/" || location === "/auth") {
        const target =
          user && (user as any).currentRole === "driver"
            ? "/driver"
            : "/passenger";
        setLocation(target);
      }
    } else {
      const isProtected =
        startsWithAny(location, PROTECTED_ROUTES) ||
        startsWithAny(location, ["/messages/"]);
      if (isProtected && location !== "/auth") {
        setLocation("/auth");
      }
    }
  }, [isAuthenticated, isLoading, location, setLocation, user]);

  if (location === "/privacy") return <PrivacyPage />;
  if (location === "/terms") return <TermsPage />;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (location === "/auth" || location.startsWith("/auth")) {
      return <AuthPage />;
    }
    return <LandingPage />;
  }

  if (location === "/complete-profile") {
    return <CompleteProfilePage />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header user={user!} />
      <ActiveTripBanner />
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 lg:p-8 pb-24">
        <Switch>
          <Route path="/driver" component={DriverPage} />
          <Route path="/passenger" component={PassengerPage} />
          <Route path="/bookings" component={BookingsPage} />
          <Route path="/messages" component={MessagesPage} />
          <Route path="/messages/:conversationType/:refId" component={ChatPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/earnings" component={EarningsPage} />
          <Route path="/points" component={PointsPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
      <BottomNav user={user!} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppContent />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
