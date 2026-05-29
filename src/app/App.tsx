import { useState, useEffect } from "react";
import { RouterProvider } from "react-router";
import { toast } from "sonner";
import { router } from "./routes";
import { LoginPage } from "./components/login-page";
import { AuthProvider } from "./context/auth-context";
import { AppStateProvider } from "../context/AppStateContext";
import { Toaster } from "./components/ui/sonner";
import { flushOfflineQueue, getQueueLength, logoutUser, refreshSession } from "../api/graphql";
import { ActivityMonitor } from "../utils/cookieMonitor";
import type { User } from "../types";

const INACTIVITY_TIMEOUT_MS = 15 * 60_000;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    refreshSession()
      .then((payload) => {
        if (mounted && payload) setUser(payload.user);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Silver: replay queued offline mutations when connectivity is restored
  useEffect(() => {
    const handleOnline = async () => {
      const pending = getQueueLength();
      if (pending === 0) return;

      toast.loading(`Syncing ${pending} offline change${pending === 1 ? "" : "s"}…`, {
        id: "offline-sync",
      });

      try {
        const flushed = await flushOfflineQueue();
        if (flushed > 0) {
          toast.success(
            `Synced ${flushed} change${flushed === 1 ? "" : "s"} with the server.`,
            { id: "offline-sync", duration: 4000 }
          );
        } else {
          toast.dismiss("offline-sync");
        }
      } catch {
        toast.error("Sync failed - changes remain queued.", {
          id: "offline-sync",
          duration: 4000,
        });
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  useEffect(() => {
    if (!user) return;

    const monitor = new ActivityMonitor();
    const recordActivity = () => monitor.recordPageVisit(window.location.pathname || "/");
    const checkInactivity = () => {
      const lastActiveAt = monitor.getLastActiveAt();
      if (!lastActiveAt) {
        recordActivity();
        return;
      }
      if (Date.now() - new Date(lastActiveAt).getTime() > INACTIVITY_TIMEOUT_MS) {
        handleLogout().catch(() => setUser(null));
      }
    };

    recordActivity();
    window.addEventListener("mousemove", recordActivity);
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("click", recordActivity);
    const interval = window.setInterval(checkInactivity, 30_000);

    return () => {
      window.removeEventListener("mousemove", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("click", recordActivity);
      window.clearInterval(interval);
    };
  }, [user]);

  if (isLoading) {
    return (
      <div className="size-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <AppStateProvider initialUser={user}>
      <AuthProvider onLogout={handleLogout}>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" richColors />
      </AuthProvider>
    </AppStateProvider>
  );
}
