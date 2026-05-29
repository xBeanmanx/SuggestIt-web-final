import { useState } from "react";
import { LogOut, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { useAuth } from "../context/auth-context";
import { useAppState } from "../../context/AppStateContext";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileDialog({ open, onClose }: ProfileDialogProps) {
  const [copied, setCopied] = useState(false);
  const { logout } = useAuth();
  const { state } = useAppState();

  const currentUser = state.currentUser;
  const userName = currentUser.name || currentUser.username || "Unknown user";
  const userEmail = currentUser.email || "No email available";
  const userId = currentUser.id;

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleSignOut = () => {
    onClose();
    logout();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent 
        className="max-w-md border"
        style={{
          padding: 'var(--spacing-3xl)',
          backgroundColor: 'var(--app-bg-secondary)',
          borderColor: 'var(--app-border-primary)'
        }}
      >
        <DialogTitle className="sr-only">User Profile</DialogTitle>
        <DialogDescription className="sr-only">
          View your profile information and sign out
        </DialogDescription>
        <div className="flex flex-col items-center text-center" style={{ gap: 'var(--spacing-lg)' }}>
          {/* User Info */}
          <div>
            <h2 
              className="mb-1"
              style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'var(--app-text-primary)'
              }}
            >
              {userName}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--app-text-muted)' }}>{userEmail}</p>
            {currentUser.username && (
              <p style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)', marginTop: '0.25rem' }}>
                @{currentUser.username}
              </p>
            )}
          </div>

          {/* User ID Section */}
          <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
            <div 
              className="flex items-center rounded-lg border"
              style={{
                gap: 'var(--spacing-sm)',
                backgroundColor: 'var(--app-bg-tertiary)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderColor: 'var(--app-border-secondary)'
              }}
            >
              <span 
                className="flex-1 truncate font-mono"
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--app-text-secondary)'
                }}
              >
                ID: {userId}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyId}
                className="flex-shrink-0 hover:opacity-90"
                style={{
                  width: '2rem',
                  height: '2rem'
                }}
              >
                {copied ? (
                  <Check style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', color: 'var(--app-purple-400)' }} />
                ) : (
                  <Copy style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', color: 'var(--app-text-muted)' }} />
                )}
              </Button>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--app-text-muted)' }}>
              Share this ID with friends to add you
            </p>
          </div>

          {/* Sign Out Button */}
          <Button
            variant="ghost"
            onClick={handleSignOut}
            className="hover:opacity-90"
            style={{
              color: 'var(--app-text-muted)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--app-text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--app-text-muted)'}
          >
            <LogOut style={{ width: 'var(--icon-sm)', height: 'var(--icon-sm)', marginRight: 'var(--spacing-sm)' }} />
            Sign Out
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
