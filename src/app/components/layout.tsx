import { useState, useEffect, useMemo } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Home, Users, UserPlus, Shield, BarChart3 } from "lucide-react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { ProfileDialog } from "./profile-dialog";
import { ActivityMonitor } from "../../utils/cookieMonitor";
import { useAppState } from "../../context/AppStateContext";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { state } = useAppState();
  const monitor = useMemo(() => new ActivityMonitor(), []);

  const isUserAdmin = state.currentUser?.role === "ADMIN";

  useEffect(() => {
    monitor.recordPageVisit(location.pathname);
  }, [location.pathname, monitor]);

  const [showProfile, setShowProfile] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  const handleLogoClick = () => {
    const now = Date.now();
    if (now - lastClickTime > 2000) {
      setClickCount(1);
    } else {
      const newCount = clickCount + 1;
      setClickCount(newCount);
      if (newCount === 5) {
        navigate("/design-principles");
        setClickCount(0);
      }
    }
    setLastClickTime(now);
  };

  return (
    <div className="flex flex-col h-screen w-full" style={{ backgroundColor: 'var(--app-bg-primary)' }}>
      {/* Header */}
      <header
        className="flex items-center justify-between border-b w-full"
        style={{
          padding: 'var(--spacing-md) var(--spacing-lg)',
          backgroundColor: 'var(--app-bg-secondary)',
          borderColor: 'var(--app-border-primary)'
        }}
      >
        <h1
          className="cursor-pointer select-none transition-colors shrink-0"
          style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: 'var(--app-text-primary)'
          }}
          onClick={handleLogoClick}
          title="Click me 5 times!"
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--app-purple-400)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--app-text-primary)'}
        >
          SuggestIt
        </h1>

        {/* Top Navigation */}
        <nav
          className="flex items-center flex-1 justify-center min-w-0"
          style={{ gap: 'var(--spacing-sm)', margin: '0 var(--spacing-md)' }}
        >
          <Link
            to="/"
            className="flex flex-col items-center min-w-0"
            style={{
              gap: 'var(--spacing-xs)',
              padding: 'var(--spacing-xs) var(--spacing-sm)',
              color: isActive("/") ? 'var(--app-purple-400)' : 'var(--app-text-muted)'
            }}
          >
            <Home style={{ width: 'var(--icon-md)', height: 'var(--icon-md)' }} />
            <span style={{ fontSize: '0.75rem' }}>Home</span>
          </Link>
          <Link
            to="/groups"
            className="flex flex-col items-center min-w-0"
            style={{
              gap: 'var(--spacing-xs)',
              padding: 'var(--spacing-xs) var(--spacing-sm)',
              color: isActive("/groups") ? 'var(--app-purple-400)' : 'var(--app-text-muted)'
            }}
          >
            <Users style={{ width: 'var(--icon-md)', height: 'var(--icon-md)' }} />
            <span style={{ fontSize: '0.75rem' }}>Groups</span>
          </Link>
          <Link
            to="/friends"
            className="flex flex-col items-center min-w-0"
            style={{
              gap: 'var(--spacing-xs)',
              padding: 'var(--spacing-xs) var(--spacing-sm)',
              color: isActive("/friends") ? 'var(--app-purple-400)' : 'var(--app-text-muted)'
            }}
          >
            <Users style={{ width: 'var(--icon-md)', height: 'var(--icon-md)' }} />
            <span style={{ fontSize: '0.75rem' }}>Friends</span>
          </Link>
          <Link
            to="/statistics"
            className="flex flex-col items-center min-w-0"
            style={{
              gap: 'var(--spacing-xs)',
              padding: 'var(--spacing-xs) var(--spacing-sm)',
              color: isActive("/statistics") ? 'var(--app-purple-400)' : 'var(--app-text-muted)'
            }}
          >
            <BarChart3 style={{ width: 'var(--icon-md)', height: 'var(--icon-md)' }} />
            <span style={{ fontSize: '0.75rem' }}>Stats</span>
          </Link>
          {isUserAdmin && (
            <Link
              to="/admin"
              className="flex flex-col items-center min-w-0"
              style={{
                gap: 'var(--spacing-xs)',
                padding: 'var(--spacing-xs) var(--spacing-sm)',
                color: isActive("/admin") ? 'var(--app-purple-400)' : 'var(--app-text-muted)'
              }}
            >
              <Shield style={{ width: 'var(--icon-md)', height: 'var(--icon-md)' }} />
              <span style={{ fontSize: '0.75rem' }}>Admin</span>
            </Link>
          )}
        </nav>

        <button onClick={() => setShowProfile(true)} className="shrink-0">
          <Avatar
            className="cursor-pointer transition-opacity hover:opacity-80"
            style={{ width: '2rem', height: '2rem' }}
          >
            <AvatarFallback style={{ backgroundColor: 'var(--app-bg-tertiary)' }}>
              <UserPlus style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', color: 'var(--app-text-secondary)' }} />
            </AvatarFallback>
          </Avatar>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto w-full" style={{ backgroundColor: 'var(--app-bg-primary)' }}>
        <Outlet />
      </main>

      {/* Profile Dialog */}
      <ProfileDialog open={showProfile} onClose={() => setShowProfile(false)} />
    </div>
  );
}
