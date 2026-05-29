import type { IStore, ObservationEntry } from "./types.js";

const RISKY_ACTION_WEIGHTS: Record<string, number> = {
  LOGIN_FAILED: 3,
  DELETE_GROUP: 4,
  DELETE_SUGGESTION: 3,
  CREATE_GROUP: 2,
  VOTE_DOWN: 1,
};

const RAPID_ACTIVITY_WINDOW_MS = 5 * 60 * 1000;
const MIN_LOGS_TO_ANALYZE = 5;

function getRiskScore(logs: Awaited<ReturnType<IStore["getRecentActionLogs"]>>): number {
  return logs.reduce((score, log) => score + (RISKY_ACTION_WEIGHTS[log.action] ?? 0), 0);
}

function hasRapidRiskPattern(logs: Awaited<ReturnType<IStore["getRecentActionLogs"]>>): boolean {
  const riskyLogs = logs.filter((log) => RISKY_ACTION_WEIGHTS[log.action]);
  if (riskyLogs.length < MIN_LOGS_TO_ANALYZE) return false;

  const timestamps = riskyLogs
    .map((log) => new Date(log.createdAt).getTime())
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((a, b) => a - b);

  for (let start = 0; start < timestamps.length; start += 1) {
    const end = timestamps.findIndex((timestamp, index) => (
      index >= start && timestamp - timestamps[start] > RAPID_ACTIVITY_WINDOW_MS
    ));
    const windowEnd = end === -1 ? timestamps.length : end;
    if (windowEnd - start >= MIN_LOGS_TO_ANALYZE) return true;
  }

  return false;
}

function getActivityDecision(logs: Awaited<ReturnType<IStore["getRecentActionLogs"]>>): {
  suspicious: boolean;
  severity: ObservationEntry["severity"];
  reason: string;
} {
  const riskScore = getRiskScore(logs);
  const failedLogins = logs.filter((log) => log.action === "LOGIN_FAILED").length;
  const destructiveActions = logs.filter((log) =>
    ["DELETE_GROUP", "DELETE_SUGGESTION"].includes(log.action)
  ).length;
  const rapidRiskPattern = hasRapidRiskPattern(logs);

  if (destructiveActions >= 3 || riskScore >= 18) {
    return {
      suspicious: true,
      severity: "high",
      reason: "Activity rules flagged repeated destructive or high-risk behaviour",
    };
  }

  if (failedLogins >= 5 || rapidRiskPattern || riskScore >= 10) {
    return {
      suspicious: true,
      severity: "medium",
      reason: "Activity rules flagged recent behaviour as suspicious",
    };
  }

  return {
    suspicious: false,
    severity: "low",
    reason: "Activity rules did not flag recent behaviour",
  };
}

export async function analyzeUserBehaviour(store: IStore, userId: string): Promise<ObservationEntry | null> {
  const logs = await store.getRecentActionLogs(userId, 25);
  if (logs.length < MIN_LOGS_TO_ANALYZE) return null;

  const decision = getActivityDecision(logs);
  if (!decision.suspicious) return null;

  return store.createObservation({
    userId,
    reason: decision.reason,
    severity: decision.severity,
    actionCount: logs.length,
  });
}

export function startActivityMonitor(store: IStore, intervalMs = 60_000): ReturnType<typeof setInterval> {
  return setInterval(async () => {
    const users = await store.getUsers();
    await Promise.all(users.map((user) => analyzeUserBehaviour(store, user.id)));
  }, intervalMs);
}

export const startAiMonitor = startActivityMonitor;
