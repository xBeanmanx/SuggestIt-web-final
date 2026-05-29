// ============================================================
// SuggestIt - Validation (pure functions, no React deps)
// ============================================================

import type { Suggestion, Group, ValidationErrors } from "../types";

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isWithinLength(value: string, max: number): boolean {
  return value.trim().length <= max;
}

export function isAtLeastLength(value: string, min: number): boolean {
  return value.trim().length >= min;
}

// ── Suggestion ─────────────────────────────────────────────

export type SuggestionFormData = Pick<Suggestion, "title" | "description">;

export function validateSuggestion(
  data: SuggestionFormData
): ValidationErrors<SuggestionFormData> {
  const errors: ValidationErrors<SuggestionFormData> = {};

  if (!isNonEmpty(data.title)) {
    errors.title = "Title is required.";
  } else if (!isAtLeastLength(data.title, 5)) {
    errors.title = "Title must be at least 5 characters.";
  } else if (!isWithinLength(data.title, 100)) {
    errors.title = "Title must be 100 characters or fewer.";
  }

  if (!isNonEmpty(data.description)) {
    errors.description = "Description is required.";
  } else if (!isAtLeastLength(data.description, 10)) {
    errors.description = "Description must be at least 10 characters.";
  } else if (!isWithinLength(data.description, 1000)) {
    errors.description = "Description must be 1000 characters or fewer.";
  }

  return errors;
}

export function isSuggestionValid(data: SuggestionFormData): boolean {
  return Object.keys(validateSuggestion(data)).length === 0;
}

// ── Group ──────────────────────────────────────────────────


export type GroupFormData = Pick<Group, "name" | "description">;

export function validateGroup(
  data: GroupFormData
): ValidationErrors<GroupFormData> {
  const errors: ValidationErrors<GroupFormData> = {};

  if (!isNonEmpty(data.name)) {
    errors.name = "Group name is required.";
  } else if (!isAtLeastLength(data.name, 3)) {
    errors.name = "Group name must be at least 3 characters.";
  } else if (!isWithinLength(data.name, 50)) {
    errors.name = "Group name must be 50 characters or fewer.";
  }

  if (!isNonEmpty(data.description)) {
    errors.description = "Description is required.";
  } else if (!isWithinLength(data.description, 300)) {
    errors.description = "Description must be 300 characters or fewer.";
  }

  return errors;
}

export function isGroupValid(data: GroupFormData): boolean {
  return Object.keys(validateGroup(data)).length === 0;
}

// ── Invite code ────────────────────────────────────────────

export function validateInviteCode(code: string): string | null {
  if (!isNonEmpty(code)) return "Invite code is required.";
  if (code.trim().length !== 6) return "Invite code must be exactly 6 characters.";
  if (!/^[A-Z0-9]+$/i.test(code.trim())) return "Invite code must be letters and numbers only.";
  return null;
}
