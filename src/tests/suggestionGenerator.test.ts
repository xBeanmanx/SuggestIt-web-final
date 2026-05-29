import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateRandomSuggestion, startSuggestionWorker } from "../../src/utils/suggestionGenerator";

describe("Suggestion Generator", () => {
  it("generateRandomSuggestion returns a suggestion with title, description, and status", () => {
    const suggestion = generateRandomSuggestion();
    
    expect(suggestion).toHaveProperty("title");
    expect(suggestion).toHaveProperty("description");
    expect(suggestion).toHaveProperty("status");
    expect(typeof suggestion.title).toBe("string");
    expect(typeof suggestion.description).toBe("string");
    expect(typeof suggestion.status).toBe("string");
    expect(suggestion.title.length).toBeGreaterThan(0);
    expect(suggestion.description.length).toBeGreaterThan(0);
    expect(["open", "under_review", "accepted", "rejected"]).toContain(suggestion.status);
  });

  it("generateRandomSuggestion returns different suggestions on multiple calls", () => {
    const suggestions = new Set();
    
    for (let i = 0; i < 20; i++) {
      const suggestion = generateRandomSuggestion();
      suggestions.add(suggestion.title);
    }
    
    // With only ~15 distinct suggestions, we should get some variety from 20 calls
    expect(suggestions.size).toBeGreaterThan(1);
  });

  it("generateRandomSuggestion returns varied statuses across multiple calls", () => {
    const statuses = new Set();
    
    for (let i = 0; i < 50; i++) {
      const suggestion = generateRandomSuggestion();
      statuses.add(suggestion.status);
    }
    
    // With 50 calls and the distribution (60% open/under_review, 25% accepted, 15% rejected),
    // we should get multiple different statuses
    expect(statuses.size).toBeGreaterThan(1);
  });

  describe("startSuggestionWorker", () => {
    let mockCreateSuggestion: ReturnType<typeof vi.fn>;
    let mockSetSuggestionStatus: ReturnType<typeof vi.fn>;
    let intervalSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockCreateSuggestion = vi.fn(() => ({ id: "sug_123" }));
      mockSetSuggestionStatus = vi.fn();
      intervalSpy = vi.spyOn(global, "setInterval");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("sets up an interval that calls createSuggestion every 3 seconds", () => {
      const cleanup = startSuggestionWorker(
        "group_1",
        mockCreateSuggestion as any,
        mockSetSuggestionStatus as any,
        "user_1"
      );

      expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 3000);
      cleanup();
    });

    it("returns a cleanup function that clears the interval", () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");
      const cleanup = startSuggestionWorker(
        "group_1",
        mockCreateSuggestion as any,
        mockSetSuggestionStatus as any,
        "user_1"
      );

      cleanup();
      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("the interval callback creates a suggestion with correct groupId", () => {
      const cleanup = startSuggestionWorker(
        "group_abc123",
        mockCreateSuggestion as any,
        mockSetSuggestionStatus as any,
        "user_1"
      );

      // Get the interval callback
      const callback = intervalSpy.mock.calls[0][0] as () => void;
      
      // Call it
      callback();

      // Verify createSuggestion was called with the group ID
      expect(mockCreateSuggestion).toHaveBeenCalledWith(
        "group_abc123",
        expect.objectContaining({
          title: expect.any(String),
          description: expect.any(String),
        })
      );

      cleanup();
    });
  });
});
