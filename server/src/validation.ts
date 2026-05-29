// ============================================================
// SuggestIt Server  Validation (Zod)
// Mirrors client-side rules so both layers agree.
// ============================================================

import { z } from "zod";
import { GraphQLError } from "graphql";

//  Suggestion 

export const createSuggestionSchema = z.object({
  groupId: z.string().min(1, "groupId is required"),
  authorId: z.string().min(1, "authorId is required"),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .min(5, "Title must be at least 5 characters")
    .max(100, "Title must be 100 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description must be 1000 characters or fewer"),
});

export const updateSuggestionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Title must be at least 5 characters")
    .max(100, "Title must be 100 characters or fewer")
    .optional(),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description must be 1000 characters or fewer")
    .optional(),
});

//  Group 

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name is required")
    .min(3, "Group name must be at least 3 characters")
    .max(50, "Group name must be 50 characters or fewer"),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(300, "Description must be 300 characters or fewer"),
  memberIds: z.array(z.string()).optional(),
});

export const updateGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Group name must be at least 3 characters")
    .max(50, "Group name must be 50 characters or fewer")
    .optional(),
  description: z
    .string()
    .trim()
    .max(300, "Description must be 300 characters or fewer")
    .optional(),
});

//  Invite code 

export const inviteCodeSchema = z
  .string()
  .trim()
  .min(1, "Invite code is required")
  .length(6, "Invite code must be exactly 6 characters")
  .regex(/^[A-Z0-9]+$/i, "Invite code must be letters and numbers only");

//  Pagination 

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(10),
});

//  Helper: throw GraphQL-friendly validation error 

export function assertValid<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const messages = result.error.errors.map((e) => e.message).join("; ");
    throw new GraphQLError(`Validation error: ${messages}`, {
      extensions: { code: "BAD_USER_INPUT", details: result.error.errors },
    });
  }
  return result.data;
}

//  Auth 

export const loginSchema = z.object({
  username: z.string().trim().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username must be 50 characters or fewer")
    .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers and underscores"),
  email: z.string().trim().email("A valid email is required").max(255),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().min(1, "Display name is required").max(255),
  requestedRole: z.enum(["ADMIN", "USER"]).optional(),
});
