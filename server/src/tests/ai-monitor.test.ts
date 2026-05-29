import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeUserBehaviour } from "../ai-monitor.js";
import { AsyncMemoryStore } from "../store-factory.js";
import { seedUser } from "./helpers.js";

let store: AsyncMemoryStore;

beforeEach(() => {
  store = new AsyncMemoryStore();
});

async function recordActions(userId: string, actions: string[]) {
  for (const action of actions) {
    await store.recordAction({
      userId,
      action,
      actionInformation: `Test ${action}`,
    });
  }
}

describe("analyzeUserBehaviour", () => {
  it("does not create an observation for low-risk activity", async () => {
    const user = seedUser(store);
    await recordActions(user.id, ["CREATE_SUGGESTION", "VOTE_UP", "JOIN_GROUP", "SEND_MESSAGE", "UPDATE_PROFILE"]);

    const result = await analyzeUserBehaviour(store, user.id);

    expect(result).toBeNull();
    await expect(store.getObservationList()).resolves.toHaveLength(0);
  });

  it("creates an observation for repeated risky activity", async () => {
    const user = seedUser(store);
    await recordActions(user.id, ["CREATE_GROUP", "CREATE_GROUP", "CREATE_GROUP", "LOGIN_FAILED", "LOGIN_FAILED"]);

    const result = await analyzeUserBehaviour(store, user.id);

    expect(result).toMatchObject({
      userId: user.id,
      severity: "medium",
      actionCount: 5,
      reason: "Activity rules flagged recent behaviour as suspicious",
    });
  });

  it("uses local rules without calling Ollama", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = seedUser(store);
    await recordActions(user.id, ["DELETE_GROUP", "DELETE_GROUP", "DELETE_GROUP", "VOTE_DOWN", "VOTE_DOWN"]);

    const result = await analyzeUserBehaviour(store, user.id);

    expect(result?.severity).toBe("high");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
