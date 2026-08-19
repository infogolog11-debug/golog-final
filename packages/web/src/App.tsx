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

function AppContent() {
  const { data: user, isLoading } = useGetMe({ retry: false });
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading) {
      if (user && (location === "/" || location === "/auth")) {
        setLocation(user.currentRole === "driver" ? "/driver" : "/passenger");
      }
    }
  }, [user, isLoading, location, setLocation]);

  if (location === "/privacy") return <PrivacyPage />;
  if (location === "/terms") return <TermsPage />;

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    if (location === "/auth" || location.startsWith("/auth")) {
      return <AuthPage />;
    }
    if (location === "/complete-profile") {
      return <CompleteProfilePage />;
    }
    return <LandingPage />;
  }

  if (location === "/complete-profile") {
    return <CompleteProfilePage />;
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <Header user={user} />
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
      <BottomNav user={user} />
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
