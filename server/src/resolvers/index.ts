// ============================================================
// SuggestIt Server  Resolvers Root
// ============================================================

import { queryResolvers } from "./queries";
import { mutationResolvers } from "./mutations";

export const resolvers = {
  User: {
    permissions(parent: { permissions?: string[] }) {
      return parent.permissions ?? [];
    },
  },
  Query: queryResolvers,
  Mutation: mutationResolvers,
};
