import "reflect-metadata";
import { DataSource, EntitySchema } from "typeorm";
import type { MSSQLConfig } from "../mssql-store.js";

export const RoleEntity = new EntitySchema<any>({
  name: "Role",
  tableName: "Roles",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    name: { type: "varchar", length: 30, unique: true },
    description: { type: "varchar", length: 255 },
  },
});

export const PermissionEntity = new EntitySchema<any>({
  name: "Permission",
  tableName: "Permissions",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    code: { type: "varchar", length: 80, unique: true },
    description: { type: "varchar", length: 255 },
  },
});

export const RolePermissionEntity = new EntitySchema<any>({
  name: "RolePermission",
  tableName: "RolePermissions",
  columns: {
    roleId: { type: "varchar", length: 36, primary: true },
    permissionId: { type: "varchar", length: 36, primary: true },
  },
  relations: {
    role: {
      type: "many-to-one",
      target: "Role",
      joinColumn: { name: "roleId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    permission: {
      type: "many-to-one",
      target: "Permission",
      joinColumn: { name: "permissionId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
});

export const UserEntity = new EntitySchema<any>({
  name: "User",
  tableName: "Users",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    name: { type: "varchar", length: 255 },
    email: { type: "varchar", length: 255, unique: true },
    username: { type: "varchar", length: 50, nullable: true },
    passwordHash: { type: "varchar", length: 255, select: false, default: "" },
    avatarUrl: { type: "varchar", length: 500, nullable: true },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
});

export const RefreshTokenEntity = new EntitySchema<any>({
  name: "RefreshToken",
  tableName: "RefreshTokens",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36 },
    tokenHash: { type: "varchar", length: 128, unique: true },
    expiresAt: { type: "datetime2" },
    revokedAt: { type: "datetime2", nullable: true },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "IX_RefreshTokens_userId", columns: ["userId"] },
    { name: "IX_RefreshTokens_tokenHash", columns: ["tokenHash"] },
  ],
});

export const UserRoleEntity = new EntitySchema<any>({
  name: "UserRole",
  tableName: "UserRoles",
  columns: {
    userId: { type: "varchar", length: 36, primary: true },
    roleId: { type: "varchar", length: 36, primary: true },
    assignedAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    role: {
      type: "many-to-one",
      target: "Role",
      joinColumn: { name: "roleId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
});

export const GroupEntity = new EntitySchema<any>({
  name: "Group",
  tableName: "Groups",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    name: { type: "varchar", length: 255 },
    description: { type: "varchar", length: "MAX", nullable: true },
    inviteCode: { type: "varchar", length: 10, unique: true },
    ownerId: { type: "varchar", length: 36 },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    owner: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "ownerId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "IX_Groups_createdAt", columns: ["createdAt"] }],
});

export const GroupMemberEntity = new EntitySchema<any>({
  name: "GroupMember",
  tableName: "GroupMembers",
  columns: {
    userId: { type: "varchar", length: 36, primary: true },
    groupId: { type: "varchar", length: 36, primary: true },
    role: { type: "varchar", length: 20 },
    joinedAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
    group: {
      type: "many-to-one",
      target: "Group",
      joinColumn: { name: "groupId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "IX_GroupMembers_groupId", columns: ["groupId"] }],
});

export const SuggestionEntity = new EntitySchema<any>({
  name: "Suggestion",
  tableName: "Suggestions",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    groupId: { type: "varchar", length: 36 },
    authorId: { type: "varchar", length: 36 },
    title: { type: "varchar", length: 100 },
    description: { type: "varchar", length: "MAX" },
    status: { type: "varchar", length: 20, default: () => "'open'" },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
    updatedAt: { type: "datetime2", updateDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    group: {
      type: "many-to-one",
      target: "Group",
      joinColumn: { name: "groupId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    author: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "authorId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
  },
  indices: [{ name: "IX_Suggestions_groupId_createdAt", columns: ["groupId", "createdAt"] }],
});

export const SuggestionVoteEntity = new EntitySchema<any>({
  name: "SuggestionVote",
  tableName: "SuggestionVotes",
  columns: {
    suggestionId: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36, primary: true },
    vote: { type: "varchar", length: 10 },
  },
  relations: {
    suggestion: {
      type: "many-to-one",
      target: "Suggestion",
      joinColumn: { name: "suggestionId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
  },
  indices: [{ name: "IX_SuggestionVotes_suggestionId", columns: ["suggestionId"] }],
});

export const AlchemyResultEntity = new EntitySchema<any>({
  name: "AlchemyResult",
  tableName: "AlchemyResults",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    groupId: { type: "varchar", length: 36 },
    title: { type: "varchar", length: 255 },
    description: { type: "varchar", length: "MAX", nullable: true },
    depth: { type: "int", default: 0 },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    group: {
      type: "many-to-one",
      target: "Group",
      joinColumn: { name: "groupId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "IX_AlchemyResults_groupId_createdAt", columns: ["groupId", "createdAt"] }],
});

export const AlchemySourceIdEntity = new EntitySchema<any>({
  name: "AlchemySourceId",
  tableName: "AlchemySourceIds",
  columns: {
    alchemyId: { type: "varchar", length: 36, primary: true },
    sourceId: { type: "varchar", length: 36 },
    position: { type: "int", primary: true },
  },
  relations: {
    alchemy: {
      type: "many-to-one",
      target: "AlchemyResult",
      joinColumn: { name: "alchemyId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
});

export const AlchemyVoteEntity = new EntitySchema<any>({
  name: "AlchemyVote",
  tableName: "AlchemyVotes",
  columns: {
    alchemyId: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36, primary: true },
    vote: { type: "varchar", length: 10 },
  },
  relations: {
    alchemy: {
      type: "many-to-one",
      target: "AlchemyResult",
      joinColumn: { name: "alchemyId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
  },
});

export const ActionLogEntity = new EntitySchema<any>({
  name: "ActionLog",
  tableName: "ActionLogs",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36 },
    groupId: { type: "varchar", length: 36, nullable: true },
    role: { type: "varchar", length: 30 },
    action: { type: "varchar", length: 80 },
    actionInformation: { type: "varchar", length: "MAX" },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
    group: {
      type: "many-to-one",
      target: "Group",
      joinColumn: { name: "groupId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
      nullable: true,
    },
  },
  indices: [{ name: "IX_ActionLogs_userId_createdAt", columns: ["userId", "createdAt"] }],
});

export const ObservationEntryEntity = new EntitySchema<any>({
  name: "ObservationEntry",
  tableName: "ObservationList",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36 },
    reason: { type: "varchar", length: "MAX" },
    severity: { type: "varchar", length: 20 },
    actionCount: { type: "int", default: 0 },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [{ name: "IX_ObservationList_userId", columns: ["userId"] }],
});

export const ChatConversationEntity = new EntitySchema<any>({
  name: "ChatConversation",
  tableName: "ChatConversations",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    name: { type: "varchar", length: 255, nullable: true },
    groupId: { type: "varchar", length: 36 },
    isGroupChat: { type: "bit", default: false },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
    updatedAt: { type: "datetime2", default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    group: {
      type: "many-to-one",
      target: "Group",
      joinColumn: { name: "groupId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
  },
  indices: [
    { name: "IX_ChatConversations_groupId", columns: ["groupId"] },
    { name: "IX_ChatConversations_groupChat", columns: ["groupId", "isGroupChat"] },
  ],
});

export const ChatConversationMembersEntity = new EntitySchema<any>({
  name: "ChatConversationMembers",
  tableName: "ChatConversationMembers",
  columns: {
    conversationId: { type: "varchar", length: 36, primary: true },
    userId: { type: "varchar", length: 36, primary: true },
  },
  relations: {
    conversation: {
      type: "many-to-one",
      target: "ChatConversation",
      joinColumn: { name: "conversationId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
  },
});

export const ChatMessageEntity = new EntitySchema<any>({
  name: "ChatMessage",
  tableName: "ChatMessages",
  columns: {
    id: { type: "varchar", length: 36, primary: true },
    conversationId: { type: "varchar", length: 36 },
    userId: { type: "varchar", length: 36 },
    content: { type: "varchar", length: "MAX" },
    createdAt: { type: "datetime2", createDate: true, default: () => "SYSUTCDATETIME()" },
  },
  relations: {
    conversation: {
      type: "many-to-one",
      target: "ChatConversation",
      joinColumn: { name: "conversationId", referencedColumnName: "id" },
      onDelete: "CASCADE",
    },
    user: {
      type: "many-to-one",
      target: "User",
      joinColumn: { name: "userId", referencedColumnName: "id" },
      onDelete: "NO ACTION",
    },
  },
  indices: [
    { name: "IX_ChatMessages_conversationId", columns: ["conversationId"] },
    { name: "IX_ChatMessages_userId", columns: ["userId"] },
    { name: "IX_ChatMessages_createdAt", columns: ["createdAt"] },
  ],
});

export const typeormEntities = [
  RoleEntity,
  PermissionEntity,
  RolePermissionEntity,
  UserEntity,
  RefreshTokenEntity,
  UserRoleEntity,
  GroupEntity,
  GroupMemberEntity,
  SuggestionEntity,
  SuggestionVoteEntity,
  AlchemyResultEntity,
  AlchemySourceIdEntity,
  AlchemyVoteEntity,
  ActionLogEntity,
  ObservationEntryEntity,
  ChatConversationEntity,
  ChatConversationMembersEntity,
  ChatMessageEntity,
];

export function createTypeOrmDataSource(config: MSSQLConfig): DataSource {
  const authentication = config.user
    ? undefined
    : config.authentication
      ? config.authentication
      : undefined;

  return new DataSource({
    type: "mssql",
    host: config.server,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    authentication: authentication as any,
    synchronize: true,
    logging: false,
    entities: typeormEntities,
    options: {
      instanceName: config.port ? undefined : config.instanceName,
      encrypt: config.options?.encrypt ?? false,
      trustServerCertificate: config.options?.trustServerCertificate ?? true,
    },
    extra: {
      connectionTimeout: config.connectionTimeout ?? 15000,
      requestTimeout: config.requestTimeout ?? 30000,
    },
  });
}
