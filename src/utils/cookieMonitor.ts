// ============================================================
// SuggestIt - Cookie-based User Activity & Preference Monitor
//
// Silver challenge requirement:
//   "design and implement a system for monitoring user activity
//    and preference on the browser using cookies"
//
// Usage:
//   import { ActivityMonitor } from "./cookieMonitor";
//   const monitor = new ActivityMonitor();
//   monitor.recordPageVisit("groups");
//   monitor.setPreference("theme", "dark");
//   monitor.getLastVisited();   // "groups"
//   monitor.getPreference("theme");  // "dark"
// ============================================================

export interface ActivityData {
  lastVisited: string | null;
  visitCounts: Record<string, number>;
  lastActiveAt: string | null;
}

export interface Preferences {
  [key: string]: string;
}

/** Low-level helpers - split out for easy unit testing */
export function setCookie(name: string, value: string, days = 365): void {
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const key = encodeURIComponent(name) + "=";
  const found = document.cookie.split(";").find((part) => part.trim().startsWith(key));
  if (!found) return null;
  return decodeURIComponent(found.trim().slice(key.length));
}

export function deleteCookie(name: string): void {
  document.cookie = `${encodeURIComponent(name)}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
}

const ACTIVITY_COOKIE = "si_activity";
const PREFS_COOKIE    = "si_prefs";

export class ActivityMonitor {
  // ── Activity tracking ─────────────────────────────────

  private readActivity(): ActivityData {
    const raw = getCookie(ACTIVITY_COOKIE);
    if (!raw) return { lastVisited: null, visitCounts: {}, lastActiveAt: null };
    try {
      return JSON.parse(raw) as ActivityData;
    } catch {
      return { lastVisited: null, visitCounts: {}, lastActiveAt: null };
    }
  }

  private writeActivity(data: ActivityData): void {
    setCookie(ACTIVITY_COOKIE, JSON.stringify(data));
  }

  recordPageVisit(page: string): void {
    const data = this.readActivity();
    data.lastVisited = page;
    data.lastActiveAt = new Date().toISOString();
    data.visitCounts[page] = (data.visitCounts[page] ?? 0) + 1;
    this.writeActivity(data);
  }

  getLastVisited(): string | null {
    return this.readActivity().lastVisited;
  }

  getVisitCount(page: string): number {
    return this.readActivity().visitCounts[page] ?? 0;
  }

  getLastActiveAt(): string | null {
    return this.readActivity().lastActiveAt;
  }

  getAllVisitCounts(): Record<string, number> {
    return this.readActivity().visitCounts;
  }

  // ── Preference tracking ───────────────────────────────

  private readPrefs(): Preferences {
    const raw = getCookie(PREFS_COOKIE);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Preferences;
    } catch {
      return {};
    }
  }

  private writePrefs(prefs: Preferences): void {
    setCookie(PREFS_COOKIE, JSON.stringify(prefs));
  }

  setPreference(key: string, value: string): void {
    const prefs = this.readPrefs();
    prefs[key] = value;
    this.writePrefs(prefs);
  }

  getPreference(key: string): string | null {
    return this.readPrefs()[key] ?? null;
  }

  clearPreference(key: string): void {
    const prefs = this.readPrefs();
    delete prefs[key];
    this.writePrefs(prefs);
  }

  // ── Reset ─────────────────────────────────────────────

  clearAll(): void {
    deleteCookie(ACTIVITY_COOKIE);
    deleteCookie(PREFS_COOKIE);
  }
}
