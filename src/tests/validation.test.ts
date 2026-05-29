// ============================================================
// SuggestIt - Validation Tests
// Run with: vitest
// ============================================================

import { describe, it, expect } from "vitest";
import {
  isNonEmpty,
  isWithinLength,
  isAtLeastLength,
  validateSuggestion,
  isSuggestionValid,
  validateGroup,
  isGroupValid,
  validateInviteCode,
  type SuggestionFormData,
  type GroupFormData,
} from "../../src/utils/validation";

// ── isNonEmpty ──────────────────────────────────────────────

describe("isNonEmpty", () => {
  it("returns true for a regular string", () => {
    expect(isNonEmpty("hello")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(isNonEmpty("")).toBe(false);
  });

  it("returns false for a whitespace-only string", () => {
    expect(isNonEmpty("   ")).toBe(false);
  });

  it("returns true for a string with surrounding whitespace", () => {
    expect(isNonEmpty("  hi  ")).toBe(true);
  });
});

// ── isWithinLength ─────────────────────────────────────────

describe("isWithinLength", () => {
  it("returns true when trimmed length equals max", () => {
    expect(isWithinLength("hello", 5)).toBe(true);
  });

  it("returns true when trimmed length is below max", () => {
    expect(isWithinLength("hi", 10)).toBe(true);
  });

  it("returns false when trimmed length exceeds max", () => {
    expect(isWithinLength("hello world", 5)).toBe(false);
  });

  it("trims before measuring", () => {
    // "  ab  " trims to "ab" (2 chars) which is ≤ 3
    expect(isWithinLength("  ab  ", 3)).toBe(true);
  });
});

// ── isAtLeastLength ────────────────────────────────────────

describe("isAtLeastLength", () => {
  it("returns true when trimmed length equals min", () => {
    expect(isAtLeastLength("hello", 5)).toBe(true);
  });

  it("returns true when trimmed length exceeds min", () => {
    expect(isAtLeastLength("hello world", 3)).toBe(true);
  });

  it("returns false when trimmed length is below min", () => {
    expect(isAtLeastLength("hi", 5)).toBe(false);
  });

  it("trims before measuring", () => {
    // "  a  " trims to "a" (1 char) which is < 3
    expect(isAtLeastLength("  a  ", 3)).toBe(false);
  });
});

// ── validateSuggestion ─────────────────────────────────────

describe("validateSuggestion", () => {
  const valid: SuggestionFormData = {
    title: "A great idea title",
    description: "This is a detailed description of the idea.",
  };

  it("returns no errors for a valid suggestion", () => {
    expect(validateSuggestion(valid)).toEqual({});
  });

  it("requires a non-empty title", () => {
    const errs = validateSuggestion({ ...valid, title: "" });
    expect(errs.title).toBeDefined();
  });

  it("requires title to be at least 5 characters", () => {
    const errs = validateSuggestion({ ...valid, title: "Hi" });
    expect(errs.title).toMatch(/5/);
  });

  it("allows title of exactly 5 characters", () => {
    const errs = validateSuggestion({ ...valid, title: "Hello" });
    expect(errs.title).toBeUndefined();
  });

  it("rejects title longer than 100 characters", () => {
    const errs = validateSuggestion({ ...valid, title: "A".repeat(101) });
    expect(errs.title).toMatch(/100/);
  });

  it("allows title of exactly 100 characters", () => {
    const errs = validateSuggestion({ ...valid, title: "A".repeat(100) });
    expect(errs.title).toBeUndefined();
  });

  it("requires a non-empty description", () => {
    const errs = validateSuggestion({ ...valid, description: "" });
    expect(errs.description).toBeDefined();
  });

  it("requires description to be at least 10 characters", () => {
    const errs = validateSuggestion({ ...valid, description: "Short" });
    expect(errs.description).toMatch(/10/);
  });

  it("allows description of exactly 10 characters", () => {
    const errs = validateSuggestion({ ...valid, description: "A".repeat(10) });
    expect(errs.description).toBeUndefined();
  });

  it("rejects description longer than 1000 characters", () => {
    const errs = validateSuggestion({ ...valid, description: "A".repeat(1001) });
    expect(errs.description).toMatch(/1000/);
  });

  it("allows description of exactly 1000 characters", () => {
    const errs = validateSuggestion({ ...valid, description: "A".repeat(1000) });
    expect(errs.description).toBeUndefined();
  });

  it("can return errors for both fields simultaneously", () => {
    const errs = validateSuggestion({ title: "", description: "" });
    expect(errs.title).toBeDefined();
    expect(errs.description).toBeDefined();
  });

  it("treats whitespace-only title as empty", () => {
    const errs = validateSuggestion({ ...valid, title: "     " });
    expect(errs.title).toBeDefined();
  });
});

// ── isSuggestionValid ──────────────────────────────────────

describe("isSuggestionValid", () => {
  it("returns true for valid data", () => {
    expect(
      isSuggestionValid({ title: "Valid Title", description: "Valid description here." })
    ).toBe(true);
  });

  it("returns false when title is missing", () => {
    expect(
      isSuggestionValid({ title: "", description: "Valid description here." })
    ).toBe(false);
  });

  it("returns false when description is too short", () => {
    expect(
      isSuggestionValid({ title: "Valid Title", description: "Short" })
    ).toBe(false);
  });
});

// ── validateGroup ──────────────────────────────────────────

describe("validateGroup", () => {
  const valid: GroupFormData = {
    name: "Dev Team",
    description: "A group for the dev team.",
  };

  it("returns no errors for valid group data", () => {
    expect(validateGroup(valid)).toEqual({});
  });

  it("requires a non-empty name", () => {
    const errs = validateGroup({ ...valid, name: "" });
    expect(errs.name).toBeDefined();
  });

  it("requires name to be at least 3 characters", () => {
    const errs = validateGroup({ ...valid, name: "AB" });
    expect(errs.name).toMatch(/3/);
  });

  it("allows name of exactly 3 characters", () => {
    const errs = validateGroup({ ...valid, name: "Dev" });
    expect(errs.name).toBeUndefined();
  });

  it("rejects name longer than 50 characters", () => {
    const errs = validateGroup({ ...valid, name: "A".repeat(51) });
    expect(errs.name).toMatch(/50/);
  });

  it("allows name of exactly 50 characters", () => {
    const errs = validateGroup({ ...valid, name: "A".repeat(50) });
    expect(errs.name).toBeUndefined();
  });

  it("requires a non-empty description", () => {
    const errs = validateGroup({ ...valid, description: "" });
    expect(errs.description).toBeDefined();
  });

  it("rejects description longer than 300 characters", () => {
    const errs = validateGroup({ ...valid, description: "A".repeat(301) });
    expect(errs.description).toMatch(/300/);
  });

  it("allows description of exactly 300 characters", () => {
    const errs = validateGroup({ ...valid, description: "A".repeat(300) });
    expect(errs.description).toBeUndefined();
  });

  it("treats whitespace-only name as empty", () => {
    const errs = validateGroup({ ...valid, name: "   " });
    expect(errs.name).toBeDefined();
  });
});

// ── isGroupValid ───────────────────────────────────────────

describe("isGroupValid", () => {
  it("returns true for valid data", () => {
    expect(isGroupValid({ name: "My Group", description: "A good group." })).toBe(true);
  });

  it("returns false for invalid data", () => {
    expect(isGroupValid({ name: "AB", description: "" })).toBe(false);
  });
});

// ── validateInviteCode ─────────────────────────────────────

describe("validateInviteCode", () => {
  it("returns null for a valid 6-char alphanumeric code", () => {
    expect(validateInviteCode("ABC123")).toBeNull();
  });

  it("returns null for a lowercase 6-char code (case-insensitive)", () => {
    expect(validateInviteCode("abc123")).toBeNull();
  });

  it("returns an error for an empty code", () => {
    expect(validateInviteCode("")).not.toBeNull();
  });

  it("returns an error for a whitespace-only code", () => {
    expect(validateInviteCode("      ")).not.toBeNull();
  });

  it("returns an error for a code shorter than 6 characters", () => {
    const err = validateInviteCode("AB12");
    expect(err).toMatch(/6/);
  });

  it("returns an error for a code longer than 6 characters", () => {
    const err = validateInviteCode("ABC1234");
    expect(err).toMatch(/6/);
  });

  it("returns an error for a code with special characters", () => {
    const err = validateInviteCode("AB-123");
    expect(err).not.toBeNull();
  });

  it("returns an error for a code with spaces in the middle", () => {
    const err = validateInviteCode("AB 123");
    expect(err).not.toBeNull();
  });
});
