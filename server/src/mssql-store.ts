// ============================================================
// SuggestIt Server  MSSQL Store Adapter
// Implements IStore interface for SQL Server persistence
// ============================================================

import sql from "mssql";
import { v4 as uuid } from "uuid";
import bcrypt from "bcrypt";

import type {
  User,
  Group,
  GroupMember,
  Suggestion,
  AlchemyResult,
  Role,
  Permission,
  ActionLog,
  ObservationEntry,
  AppRoleName,
  SuggestionStatus,
  VoteType,
  IStore,
  ChatMessage,
  ChatConversation,
  RefreshTokenRecord,
  TopContributor,
} from "./types.js";
import { migrateWithTypeOrm } from "./orm/typeorm-migrator.js";

export interface MSSQLConfig {
  server: string;
  port?: number;
  instanceName?: string;
  database: string;
  user?: string;
  password?: string;
  authentication?: sql.config["authentication"];
  options?: {
    encrypt?: boolean;
    trustServerCertificate?: boolean;
  };
  connectionTimeout?: number;
  requestTimeout?: number;
}

function decisionThreshold(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount / 2));
}

export class MSSQLStore implements IStore {
  private pool: sql.ConnectionPool | null = null;
  private config: MSSQLConfig;

  constructor(config: MSSQLConfig) {
    this.config = config;
  }

  /**
   * Initialize connection pool and create schema if needed
   */
  async initialize(): Promise<void> {
    // Build authentication config from user/password or use provided authentication
    let authentication = this.config.authentication;
    if (!authentication && this.config.user) {
      authentication = {
        type: "default" as const,
        options: {
          userName: this.config.user,
          password: this.config.password || "",
        },
      };
    }

    const poolConfig: sql.config = {
      server: this.config.server,
      port: this.config.port,
      database: this.config.database,
      authentication,
      options: {
        instanceName: this.config.port ? undefined : this.config.instanceName,
        encrypt: this.config.options?.encrypt ?? false,
        trustServerCertificate:
          this.config.options?.trustServerCertificate ?? false,
      },
      connectionTimeout: this.config.connectionTimeout ?? 15000,
      requestTimeout: this.config.requestTimeout ?? 30000,
    };

    this.pool = new sql.ConnectionPool(poolConfig);
    await this.pool.connect();
    console.log(" Connected to MSSQL");

    await this.createSchema();
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
    }
  }

  /**
   * Create tables from the entity metadata model if they don't exist.
   */
  private async createSchema(): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await migrateWithTypeOrm(this.config);
    console.log(" Database schema ready");
  }

  private async getMembersByGroupIds(groupIds: string[]): Promise<Map<string, GroupMember[]>> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const membersByGroupId = new Map<string, GroupMember[]>();
    if (groupIds.length === 0) return membersByGroupId;

    const request = this.pool.request();
    const placeholders = groupIds.map((id, index) => {
      const name = `groupId${index}`;
      request.input(name, sql.VarChar, id);
      return `@${name}`;
    });

    const membersResult = await request.query(`
      SELECT gm.userId, gm.groupId, gm.role, gm.joinedAt,
             u.id AS u_id, u.name AS u_name, u.email AS u_email, u.username AS u_username,
             u.avatarUrl AS u_avatarUrl, u.createdAt AS u_createdAt
      FROM GroupMembers gm
      JOIN Users u ON gm.userId = u.id
      WHERE gm.groupId IN (${placeholders.join(", ")})
      ORDER BY gm.joinedAt ASC
    `);

    for (const row of membersResult.recordset as any[]) {
      const member: GroupMember = {
        userId: row.userId,
        groupId: row.groupId,
        role: row.role,
        joinedAt: row.joinedAt,
        user: {
          id: row.u_id,
          name: row.u_name,
          email: row.u_email,
          username: row.u_username,
          avatarUrl: row.u_avatarUrl,
          createdAt: row.u_createdAt,
        },
      };
      const members = membersByGroupId.get(row.groupId) ?? [];
      members.push(member);
      membersByGroupId.set(row.groupId, members);
    }

    return membersByGroupId;
  }

  private async hydrateUserAccess(user: User | undefined): Promise<User | undefined> {
    if (!this.pool || !user) return user;

    const access = await this.pool
      .request()
      .input("userId", sql.VarChar, user.id)
      .query(`
        SELECT TOP 1 r.name AS roleName
        FROM UserRoles ur
        JOIN Roles r ON r.id = ur.roleId
        WHERE ur.userId = @userId
        ORDER BY CASE WHEN r.name = 'ADMIN' THEN 0 ELSE 1 END
      `);

    const role = (access.recordset[0]?.roleName ?? "USER") as AppRoleName;
    const permissions = await this.pool
      .request()
      .input("role", sql.VarChar, role)
      .query(`
        SELECT p.code
        FROM Permissions p
        JOIN RolePermissions rp ON rp.permissionId = p.id
        JOIN Roles r ON r.id = rp.roleId
        WHERE r.name = @role
        ORDER BY p.code
      `);

    const safeUser = {
      ...user,
      role,
      permissions: permissions.recordset.map((row: { code: string }) => row.code),
    };
    delete (safeUser as { password?: string }).password;
    delete (safeUser as { passwordHash?: string }).passwordHash;
    return safeUser;
  }

  private async assignRole(userId: string, role: AppRoleName): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("roleName", sql.VarChar, role)
      .query(`
        MERGE UserRoles AS target
        USING (SELECT @userId AS userId, id AS roleId FROM Roles WHERE name = @roleName) AS source
        ON target.userId = source.userId AND target.roleId = source.roleId
        WHEN NOT MATCHED THEN INSERT (userId, roleId) VALUES (source.userId, source.roleId);
      `);
  }

  //  Users 

  async getUsers(): Promise<User[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .query("SELECT * FROM Users ORDER BY createdAt DESC");
    const users = await Promise.all((result.recordset as User[]).map((user) => this.hydrateUserAccess(user)));
    return users.filter((user): user is User => Boolean(user));
  }

  async getUserById(id: string): Promise<User | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query("SELECT * FROM Users WHERE id = @id");
    return this.hydrateUserAccess((result.recordset[0] as User | undefined) || undefined);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("email", sql.VarChar, email.toLowerCase())
      .query("SELECT * FROM Users WHERE LOWER(email) = @email");
    return this.hydrateUserAccess((result.recordset[0] as User | undefined) || undefined);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("username", sql.VarChar, username.toLowerCase())
      .query("SELECT * FROM Users WHERE LOWER(username) = @username");
    return this.hydrateUserAccess((result.recordset[0] as User | undefined) || undefined);
  }

  async createUser(
    data: Omit<User, "id" | "createdAt" | "passwordHash"> & { password?: string; passwordHash?: string }
  ): Promise<User> {
  if (!this.pool) throw new Error("Connection pool not initialized");
  const id = uuid();
  const now = new Date(); // Use a Date object

  const passwordHash =
    data.passwordHash ?? (data.password ? await bcrypt.hash(data.password, 10) : "");

  await this.pool
    .request()
    .input("id", sql.VarChar, id)
    .input("name", sql.VarChar, data.name)
    .input("email", sql.VarChar, data.email.toLowerCase())
    .input("username", sql.VarChar, data.username.toLowerCase())
    .input("passwordHash", sql.VarChar, passwordHash)
    .input("avatarUrl", sql.VarChar, data.avatarUrl ?? null) // SQL expects null
    .input("createdAt", sql.DateTime2, now)
    .query(
      "INSERT INTO Users (id, name, email, username, passwordHash, avatarUrl, createdAt) VALUES (@id, @name, @email, @username, @passwordHash, @avatarUrl, @createdAt)"
    );

  await this.assignRole(id, data.role ?? "USER");
  
  // Reload from DB to get the hydrated User object with correct types
  const user = await this.getUserById(id);
  if (!user) throw new Error("User creation failed: could not retrieve record");
  
  return user;
}
  async login(data: { email: string; name: string; requestedRole?: AppRoleName }): Promise<User> {
  const existing = await this.getUserByEmail(data.email);
  if (existing) return existing;

  const userCount = (await this.getUsers()).length;
  const role = data.requestedRole ?? (userCount === 0 ? "ADMIN" : "USER");
  
  return this.createUser({
    name: data.name,
    email: data.email.toLowerCase(),
    username: data.email.split("@")[0],
    avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(data.email)}`,
    role,
    permissions: [],
  });
}

  async setUserRole(userId: string, role: AppRoleName): Promise<User | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const existing = await this.getUserById(userId);
    if (!existing) return undefined;

    await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query("DELETE FROM UserRoles WHERE userId = @userId");

    await this.assignRole(userId, role);
    return this.getUserById(userId);
  }

  async validateUserPassword(username: string, password: string): Promise<User | undefined> {
  if (!this.pool) return undefined;

  const result = await this.pool.request()
    .input("username", sql.VarChar, username.toLowerCase())
    .query("SELECT * FROM Users WHERE LOWER(username) = @username");

  const rawUser = result.recordset[0];
  if (!rawUser?.passwordHash) return undefined;

  const isMatch = await bcrypt.compare(password, rawUser.passwordHash);
  if (!isMatch) return undefined;

  const user = await this.hydrateUserAccess(rawUser);
  return user;
}

  async updateUserPassword(userId: string, password: string): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("passwordHash", sql.VarChar, await bcrypt.hash(password, 10))
      .query("UPDATE Users SET passwordHash = @passwordHash WHERE id = @userId");
    await this.revokeUserRefreshTokens(userId);
  }

  async createRefreshToken(record: RefreshTokenRecord): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await this.pool
      .request()
      .input("id", sql.VarChar, record.id)
      .input("userId", sql.VarChar, record.userId)
      .input("tokenHash", sql.VarChar, record.tokenHash)
      .input("expiresAt", sql.DateTime2, record.expiresAt)
      .input("revokedAt", sql.DateTime2, record.revokedAt ?? null)
      .input("createdAt", sql.DateTime2, record.createdAt)
      .query(`
        INSERT INTO RefreshTokens (id, userId, tokenHash, expiresAt, revokedAt, createdAt)
        VALUES (@id, @userId, @tokenHash, @expiresAt, @revokedAt, @createdAt)
      `);
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("tokenHash", sql.VarChar, tokenHash)
      .query("SELECT * FROM RefreshTokens WHERE tokenHash = @tokenHash");
    return (result.recordset[0] as RefreshTokenRecord | undefined) || undefined;
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await this.pool
      .request()
      .input("tokenHash", sql.VarChar, tokenHash)
      .input("revokedAt", sql.DateTime2, new Date().toISOString())
      .query("UPDATE RefreshTokens SET revokedAt = @revokedAt WHERE tokenHash = @tokenHash");
  }

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("revokedAt", sql.DateTime2, new Date().toISOString())
      .query("UPDATE RefreshTokens SET revokedAt = @revokedAt WHERE userId = @userId AND revokedAt IS NULL");
  }

  async getRoles(): Promise<Role[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool.request().query("SELECT * FROM Roles ORDER BY name");
    return result.recordset as Role[];
  }

  async getPermissions(): Promise<Permission[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool.request().query("SELECT * FROM Permissions ORDER BY code");
    return result.recordset as Permission[];
  }

  //  Groups 

  async getGroups(): Promise<Group[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .query(`
        SELECT
          g.id,
          g.name,
          CAST(g.description AS VARCHAR(MAX)) AS description,
          g.inviteCode,
          g.ownerId,
          g.createdAt,
          (SELECT COUNT(*) FROM GroupMembers gm WHERE gm.groupId = g.id) AS memberCount,
          (SELECT COUNT(*) FROM Suggestions s WHERE s.groupId = g.id) AS suggestionCount
        FROM Groups g
        ORDER BY g.createdAt DESC
      `);
    const groups = result.recordset as Group[];
    const membersByGroupId = await this.getMembersByGroupIds(groups.map((g) => g.id));
    return groups.map((group) => ({
      ...group,
      members: membersByGroupId.get(group.id) ?? [],
    }));
  }

  async getGroupById(id: string): Promise<Group | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const groupResult = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query(`
        SELECT
          g.id,
          g.name,
          CAST(g.description AS VARCHAR(MAX)) AS description,
          g.inviteCode,
          g.ownerId,
          g.createdAt,
          (SELECT COUNT(*) FROM GroupMembers gm WHERE gm.groupId = g.id) AS memberCount,
          (SELECT COUNT(*) FROM Suggestions s WHERE s.groupId = g.id) AS suggestionCount
        FROM Groups g
        WHERE g.id = @id
      `);

    if (!groupResult.recordset[0]) return undefined;

    const group = { ...groupResult.recordset[0] } as Group;

    // Fetch members with their user details
    group.members = (await this.getMembersByGroupIds([id])).get(id) ?? [];

    return group;
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("code", sql.VarChar, code.toUpperCase())
      .query("SELECT id FROM Groups WHERE UPPER(inviteCode) = @code");
    const id = result.recordset[0]?.id as string | undefined;
    return id ? this.getGroupById(id) : undefined;
  }

  async createGroup(
    data: Omit<
      Group,
      "id" | "createdAt" | "inviteCode" | "memberCount" | "suggestionCount" | "members"
    >,
    memberIds?: string[]
  ): Promise<Group> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const id = uuid();
    const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    const now = new Date().toISOString();

    const request = this.pool.request();
    request
      .input("id", sql.VarChar, id)
      .input("name", sql.VarChar, data.name)
      .input("description", sql.VarChar, data.description)
      .input("inviteCode", sql.VarChar, inviteCode)
      .input("ownerId", sql.VarChar, data.ownerId)
      .input("createdAt", sql.DateTime2, now);

    await request.query(
      "INSERT INTO Groups (id, name, description, inviteCode, ownerId, createdAt) VALUES (@id, @name, @description, @inviteCode, @ownerId, @createdAt)"
    );

    // Add owner as member
    await this.pool
      .request()
      .input("userId", sql.VarChar, data.ownerId)
      .input("groupId", sql.VarChar, id)
      .input("role", sql.VarChar, "owner")
      .input("joinedAt", sql.DateTime2, now)
      .query(
        "INSERT INTO GroupMembers (userId, groupId, role, joinedAt) VALUES (@userId, @groupId, @role, @joinedAt)"
      );

    // Add other members
    if (memberIds && memberIds.length > 0) {
      for (const userId of memberIds) {
        if (userId !== data.ownerId) {
          await this.pool
            .request()
            .input("userId", sql.VarChar, userId)
            .input("groupId", sql.VarChar, id)
            .input("role", sql.VarChar, "member")
            .input("joinedAt", sql.DateTime2, now)
            .query(
              "INSERT INTO GroupMembers (userId, groupId, role, joinedAt) VALUES (@userId, @groupId, @role, @joinedAt)"
            );
        }
      }
    }

    const group = await this.getGroupById(id);
    if (!group) throw new Error(`Created group ${id} could not be loaded`);
    return group;
  }

  async updateGroup(
    id: string,
    changes: Partial<Pick<Group, "name" | "description">>
  ): Promise<Group | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const updates: string[] = [];
    const request = this.pool.request().input("id", sql.VarChar, id);

    if (changes.name !== undefined) {
      updates.push("name = @name");
      request.input("name", sql.VarChar, changes.name);
    }
    if (changes.description !== undefined) {
      updates.push("description = @description");
      request.input("description", sql.VarChar, changes.description);
    }

    if (updates.length === 0) return this.getGroupById(id);

    await request.query(`UPDATE Groups SET ${updates.join(", ")} WHERE id = @id`);
    return this.getGroupById(id);
  }

  async deleteGroup(id: string): Promise<boolean> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query("DELETE FROM Groups WHERE id = @id");
    return result.rowsAffected[0] > 0;
  }

  async joinGroup(groupId: string, userId: string): Promise<Group | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const exists = await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("groupId", sql.VarChar, groupId)
      .query(
        "SELECT * FROM GroupMembers WHERE userId = @userId AND groupId = @groupId"
      );

    if (exists.recordset.length > 0) return this.getGroupById(groupId);

    const now = new Date().toISOString();
    await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("groupId", sql.VarChar, groupId)
      .input("role", sql.VarChar, "member")
      .input("joinedAt", sql.DateTime2, now)
      .query(
        "INSERT INTO GroupMembers (userId, groupId, role, joinedAt) VALUES (@userId, @groupId, @role, @joinedAt)"
      );

    return this.getGroupById(groupId);
  }

  async leaveGroup(groupId: string, userId: string): Promise<boolean> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("groupId", sql.VarChar, groupId)
      .query("DELETE FROM GroupMembers WHERE userId = @userId AND groupId = @groupId");
    return result.rowsAffected[0] > 0;
  }

  //  Suggestions 

  async getSuggestions(groupId: string): Promise<Suggestion[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("groupId", sql.VarChar, groupId)
      .query(`
        SELECT
          s.id,
          s.groupId,
          s.authorId,
          s.title,
          CAST(s.description AS VARCHAR(MAX)) AS description,
          s.status,
          s.createdAt,
          s.updatedAt,
          (SELECT COUNT(*) FROM SuggestionVotes sv WHERE sv.suggestionId = s.id AND sv.vote = 'up') AS upvotes,
          (SELECT COUNT(*) FROM SuggestionVotes sv WHERE sv.suggestionId = s.id AND sv.vote = 'down') AS downvotes
        FROM Suggestions s
        WHERE s.groupId = @groupId
        ORDER BY s.createdAt DESC
      `);
    return result.recordset as Suggestion[];
  }

  async getSuggestionById(id: string): Promise<Suggestion | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query(`
        SELECT
          s.id,
          s.groupId,
          s.authorId,
          s.title,
          CAST(s.description AS VARCHAR(MAX)) AS description,
          s.status,
          s.createdAt,
          s.updatedAt,
          (SELECT COUNT(*) FROM SuggestionVotes sv WHERE sv.suggestionId = s.id AND sv.vote = 'up') AS upvotes,
          (SELECT COUNT(*) FROM SuggestionVotes sv WHERE sv.suggestionId = s.id AND sv.vote = 'down') AS downvotes
        FROM Suggestions s
        WHERE s.id = @id
      `);
    return (result.recordset[0] as Suggestion | undefined) || undefined;
  }

  async createSuggestion(
    data: Omit<
      Suggestion,
      | "id"
      | "status"
      | "upvotes"
      | "downvotes"
      | "currentUserVote"
      | "createdAt"
      | "updatedAt"
      | "isOwnSuggestion"
    >
  ): Promise<Suggestion> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const id = uuid();
    const now = new Date().toISOString();

    await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .input("groupId", sql.VarChar, data.groupId)
      .input("authorId", sql.VarChar, data.authorId)
      .input("title", sql.VarChar, data.title)
      .input("description", sql.VarChar, data.description)
      .input("createdAt", sql.DateTime2, now)
      .query(
        "INSERT INTO Suggestions (id, groupId, authorId, title, description, status, createdAt, updatedAt) VALUES (@id, @groupId, @authorId, @title, @description, 'open', @createdAt, @createdAt)"
      );

    return {
      id,
      ...data,
      status: "open",
      upvotes: 0,
      downvotes: 0,
      currentUserVote: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateSuggestion(
    id: string,
    changes: Partial<Pick<Suggestion, "title" | "description">>
  ): Promise<Suggestion | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const updates: string[] = [];
    const request = this.pool.request().input("id", sql.VarChar, id);

    if (changes.title !== undefined) {
      updates.push("title = @title");
      request.input("title", sql.VarChar, changes.title);
    }
    if (changes.description !== undefined) {
      updates.push("description = @description");
      request.input("description", sql.VarChar, changes.description);
    }

    updates.push("updatedAt = @updatedAt");
    request.input("updatedAt", sql.DateTime2, new Date().toISOString());

    if (updates.length === 1) return this.getSuggestionById(id);

    await request.query(
      `UPDATE Suggestions SET ${updates.join(", ")} WHERE id = @id`
    );
    return this.getSuggestionById(id);
  }

  async deleteSuggestion(id: string): Promise<boolean> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query("DELETE FROM Suggestions WHERE id = @id");
    return result.rowsAffected[0] > 0;
  }

  async voteSuggestion(
    id: string,
    userId: string,
    vote: VoteType | null
  ): Promise<Suggestion | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const suggestion = await this.getSuggestionById(id);
    if (!suggestion) return undefined;

    // Check current vote
    const currentVoteResult = await this.pool
      .request()
      .input("suggestionId", sql.VarChar, id)
      .input("userId", sql.VarChar, userId)
      .query(
        "SELECT vote FROM SuggestionVotes WHERE suggestionId = @suggestionId AND userId = @userId"
      );

    const previousVote = currentVoteResult.recordset[0]?.vote ?? null;
    const resolvedVote = previousVote === vote ? null : vote;

    // Update vote record (MERGE = upsert)
    if (resolvedVote === null) {
      await this.pool
        .request()
        .input("suggestionId", sql.VarChar, id)
        .input("userId", sql.VarChar, userId)
        .query(
          "DELETE FROM SuggestionVotes WHERE suggestionId = @suggestionId AND userId = @userId"
        );
    } else {
      await this.pool
        .request()
        .input("suggestionId", sql.VarChar, id)
        .input("userId", sql.VarChar, userId)
        .input("vote", sql.VarChar, resolvedVote)
        .query(
          "MERGE SuggestionVotes t USING (SELECT @suggestionId as suggestionId, @userId as userId) s ON t.suggestionId = s.suggestionId AND t.userId = s.userId WHEN MATCHED THEN UPDATE SET vote = @vote WHEN NOT MATCHED THEN INSERT (suggestionId, userId, vote) VALUES (s.suggestionId, s.userId, @vote);"
        );
    }

    // Derive current totals from the votes table (single query, no stale cache)
    const votesResult = await this.pool
      .request()
      .input("suggestionId", sql.VarChar, id)
      .query(
        "SELECT COUNT(CASE WHEN vote = 'up' THEN 1 END) AS upvotes, COUNT(CASE WHEN vote = 'down' THEN 1 END) AS downvotes FROM SuggestionVotes WHERE suggestionId = @suggestionId"
      );

    const { upvotes = 0, downvotes = 0 } = votesResult.recordset[0] ?? {};

    // A suggestion is decided once the rounded-down threshold is reached.
    const group = await this.getGroupById(suggestion.groupId);
    if (group && downvotes >= decisionThreshold(group.memberCount)) {
      await this.deleteSuggestion(id);
      return undefined;
    }
    if (group && upvotes >= decisionThreshold(group.memberCount)) {
      await this.setSuggestionStatus(id, "accepted");
    }

    const updated = await this.getSuggestionById(id);
    return updated ? { ...updated, currentUserVote: resolvedVote } : undefined;
  }

  async setSuggestionStatus(
    id: string,
    status: SuggestionStatus
  ): Promise<Suggestion | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    if (status === "rejected") {
      await this.deleteSuggestion(id);
      return undefined;
    }

    await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .input("status", sql.VarChar, status)
      .input("updatedAt", sql.DateTime2, new Date().toISOString())
      .query(
        "UPDATE Suggestions SET status = @status, updatedAt = @updatedAt WHERE id = @id"
      );

    return this.getSuggestionById(id);
  }

  //  Alchemy 

  async getAlchemyResults(groupId: string): Promise<AlchemyResult[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.pool
      .request()
      .input("groupId", sql.VarChar, groupId)
      .query(`
        SELECT
          ar.id,
          ar.groupId,
          ar.title,
          CAST(ar.description AS VARCHAR(MAX)) AS description,
          ar.depth,
          ar.createdAt,
          (SELECT COUNT(*) FROM AlchemyVotes av WHERE av.alchemyId = ar.id AND av.vote = 'up') AS upvotes,
          (SELECT COUNT(*) FROM AlchemyVotes av WHERE av.alchemyId = ar.id AND av.vote = 'down') AS downvotes
        FROM AlchemyResults ar
        WHERE ar.groupId = @groupId
        ORDER BY ar.createdAt DESC
      `);

    const rows = result.recordset as any[];
    if (rows.length === 0) return [];

    const sourceRequest = this.pool.request();
    const placeholders = rows.map((r, index) => {
      const name = `alchemyId${index}`;
      sourceRequest.input(name, sql.VarChar, r.id);
      return `@${name}`;
    });
    const srcResult = await sourceRequest.query(
      `SELECT alchemyId, sourceId, position FROM AlchemySourceIds WHERE alchemyId IN (${placeholders.join(", ")}) ORDER BY alchemyId, position`
    );

    const srcMap = new Map<string, string[]>();
    for (const s of srcResult.recordset as any[]) {
      if (!srcMap.has(s.alchemyId)) srcMap.set(s.alchemyId, []);
      srcMap.get(s.alchemyId)!.push(s.sourceId);
    }

    return rows.map((r) => ({
      ...r,
      sourceIds: (srcMap.get(r.id) ?? []) as [string, string],
    })) as AlchemyResult[];
  }

  async getAlchemyResultById(id: string): Promise<AlchemyResult | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query(`
        SELECT
          ar.id,
          ar.groupId,
          ar.title,
          CAST(ar.description AS VARCHAR(MAX)) AS description,
          ar.depth,
          ar.createdAt,
          (SELECT COUNT(*) FROM AlchemyVotes av WHERE av.alchemyId = ar.id AND av.vote = 'up') AS upvotes,
          (SELECT COUNT(*) FROM AlchemyVotes av WHERE av.alchemyId = ar.id AND av.vote = 'down') AS downvotes
        FROM AlchemyResults ar
        WHERE ar.id = @id
      `);

    if (!result.recordset[0]) return undefined;
    const r = result.recordset[0] as any;

    const srcResult = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query("SELECT sourceId FROM AlchemySourceIds WHERE alchemyId = @id ORDER BY position");

    const sourceIds = srcResult.recordset.map((s: any) => s.sourceId) as [string, string];
    return { ...r, sourceIds } as AlchemyResult;
  }

  async createAlchemyResult(
    data: Omit<
      AlchemyResult,
      "id" | "createdAt" | "upvotes" | "downvotes" | "currentUserVote"
    >
  ): Promise<AlchemyResult> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const id = uuid();
    const now = new Date().toISOString();

    await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .input("groupId", sql.VarChar, data.groupId)
      .input("title", sql.VarChar, data.title)
      .input("description", sql.VarChar, data.description)
      .input("depth", sql.Int, data.depth)
      .input("createdAt", sql.DateTime2, now)
      .query(
        "INSERT INTO AlchemyResults (id, groupId, title, description, depth, createdAt) VALUES (@id, @groupId, @title, @description, @depth, @createdAt)"
      );

    // Insert source ids into the normalised junction table
    for (let i = 0; i < data.sourceIds.length; i++) {
      await this.pool
        .request()
        .input("alchemyId", sql.VarChar, id)
        .input("sourceId", sql.VarChar, data.sourceIds[i])
        .input("position", sql.Int, i)
        .query(
          "INSERT INTO AlchemySourceIds (alchemyId, sourceId, position) VALUES (@alchemyId, @sourceId, @position)"
        );
    }

    return { id, ...data, upvotes: 0, downvotes: 0, currentUserVote: null, createdAt: now };
  }

  async voteAlchemy(
    id: string,
    userId: string,
    vote: VoteType | null
  ): Promise<AlchemyResult | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.getAlchemyResultById(id);
    if (!result) return undefined;

    const currentVoteResult = await this.pool
      .request()
      .input("alchemyId", sql.VarChar, id)
      .input("userId", sql.VarChar, userId)
      .query(
        "SELECT vote FROM AlchemyVotes WHERE alchemyId = @alchemyId AND userId = @userId"
      );

    const previousVote = currentVoteResult.recordset[0]?.vote ?? null;
    const resolvedVote = previousVote === vote ? null : vote;

    if (resolvedVote === null) {
      await this.pool
        .request()
        .input("alchemyId", sql.VarChar, id)
        .input("userId", sql.VarChar, userId)
        .query(
          "DELETE FROM AlchemyVotes WHERE alchemyId = @alchemyId AND userId = @userId"
        );
    } else {
      await this.pool
        .request()
        .input("alchemyId", sql.VarChar, id)
        .input("userId", sql.VarChar, userId)
        .input("vote", sql.VarChar, resolvedVote)
        .query(
          "MERGE AlchemyVotes t USING (SELECT @alchemyId as alchemyId, @userId as userId) s ON t.alchemyId = s.alchemyId AND t.userId = s.userId WHEN MATCHED THEN UPDATE SET vote = @vote WHEN NOT MATCHED THEN INSERT (alchemyId, userId, vote) VALUES (s.alchemyId, s.userId, @vote);"
        );
    }

    return this.getAlchemyResultById(id);
  }

  //  Chat Methods 

  async getConversations(groupId: string): Promise<ChatConversation[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.pool
      .request()
      .input("groupId", sql.VarChar, groupId)
      .query(`
        SELECT
          c.id,
          c.name,
          c.groupId,
          c.createdAt,
          c.updatedAt,
          (SELECT COUNT(*) FROM ChatMessages cm WHERE cm.conversationId = c.id) AS messageCount
        FROM ChatConversations c
        WHERE c.groupId = @groupId
        ORDER BY c.updatedAt DESC
      `);

    const conversations = result.recordset as any[];
    const conversationIds = conversations.map((c) => c.id);

    if (conversationIds.length === 0) {
      return [];
    }

    // Get members for each conversation
    const memberRequest = this.pool.request();
    const placeholders = conversationIds.map((id, index) => {
      const name = `convId${index}`;
      memberRequest.input(name, sql.VarChar, id);
      return `@${name}`;
    });

    const membersResult = await memberRequest.query(`
      SELECT
        ccm.conversationId,
        u.id, u.name, u.email, u.username, u.avatarUrl, u.createdAt
      FROM ChatConversationMembers ccm
      JOIN Users u ON ccm.userId = u.id
      WHERE ccm.conversationId IN (${placeholders.join(", ")})
    `);

    const membersByConvId = new Map<string, User[]>();
    for (const row of membersResult.recordset as any[]) {
      const user: User = {
        id: row.id,
        name: row.name,
        email: row.email,
        username: row.username,
        avatarUrl: row.avatarUrl,
        createdAt: row.createdAt,
      };
      const members = membersByConvId.get(row.conversationId) ?? [];
      members.push(user);
      membersByConvId.set(row.conversationId, members);
    }

    return conversations.map((conv: any) => ({
      id: conv.id,
      name: conv.name,
      groupId: conv.groupId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messageCount,
      members: membersByConvId.get(conv.id) ?? [],
    }));
  }

  async getConversationById(id: string): Promise<ChatConversation | undefined> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .query(`
        SELECT
          c.id,
          c.name,
          c.groupId,
          c.createdAt,
          c.updatedAt,
          (SELECT COUNT(*) FROM ChatMessages cm WHERE cm.conversationId = c.id) AS messageCount
        FROM ChatConversations c
        WHERE c.id = @id
      `);

    if (result.recordset.length === 0) {
      return undefined;
    }

    const conv = result.recordset[0] as any;

    // Get members
    const membersResult = await this.pool
      .request()
      .input("conversationId", sql.VarChar, id)
      .query(`
        SELECT
          u.id, u.name, u.email, u.username, u.avatarUrl, u.createdAt
        FROM ChatConversationMembers ccm
        JOIN Users u ON ccm.userId = u.id
        WHERE ccm.conversationId = @conversationId
      `);

    const members = membersResult.recordset.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      username: row.username,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
    })) as User[];

    return {
      id: conv.id,
      name: conv.name,
      groupId: conv.groupId,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      messageCount: conv.messageCount,
      members,
    };
  }

  async createConversation(
    data: Omit<ChatConversation, "id" | "createdAt" | "updatedAt" | "messageCount" | "messages">
  ): Promise<ChatConversation> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const conversationId = uuid();
    const now = new Date();

    await this.pool
      .request()
      .input("id", sql.VarChar, conversationId)
      .input("name", sql.VarChar, data.name ?? null)
      .input("groupId", sql.VarChar, data.groupId)
      .input("createdAt", sql.DateTime2, now)
      .input("updatedAt", sql.DateTime2, now)
      .query(`
        INSERT INTO ChatConversations (id, name, groupId, createdAt, updatedAt)
        VALUES (@id, @name, @groupId, @createdAt, @updatedAt)
      `);

    // Add members to the conversation
    for (const member of data.members) {
      await this.pool
        .request()
        .input("conversationId", sql.VarChar, conversationId)
        .input("userId", sql.VarChar, member.id)
        .query(`
          INSERT INTO ChatConversationMembers (conversationId, userId)
          VALUES (@conversationId, @userId)
        `);
    }

    return {
      id: conversationId,
      name: data.name ?? null,
      groupId: data.groupId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      messageCount: 0,
      members: data.members,
    };
  }

  async getConversationMessages(
    conversationId: string,
    limit?: number
  ): Promise<ChatMessage[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    let query = `
      SELECT
        cm.id,
        cm.conversationId,
        cm.userId,
        cm.content,
        cm.createdAt,
        u.id AS u_id,
        u.name AS u_name,
        u.email AS u_email,
        u.username AS u_username,
        u.avatarUrl AS u_avatarUrl,
        u.createdAt AS u_createdAt
      FROM ChatMessages cm
      JOIN Users u ON cm.userId = u.id
      WHERE cm.conversationId = @conversationId
      ORDER BY cm.createdAt ASC
    `;

    if (limit) {
      query += ` OFFSET (SELECT COUNT(*) FROM ChatMessages WHERE conversationId = @conversationId) - ${limit} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }

    const result = await this.pool
      .request()
      .input("conversationId", sql.VarChar, conversationId)
      .query(query);

    return result.recordset.map((row: any) => ({
      id: row.id,
      conversationId: row.conversationId,
      userId: row.userId,
      content: row.content,
      createdAt: row.createdAt,
      user: {
        id: row.u_id,
        name: row.u_name,
        email: row.u_email,
        username: row.u_username,
        avatarUrl: row.u_avatarUrl,
        createdAt: row.u_createdAt,
      },
    })) as ChatMessage[];
  }

  async sendChatMessage(
    data: Omit<ChatMessage, "id" | "createdAt">
  ): Promise<ChatMessage> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const messageId = uuid();
    const now = new Date();

    await this.pool
      .request()
      .input("id", sql.VarChar, messageId)
      .input("conversationId", sql.VarChar, data.conversationId)
      .input("userId", sql.VarChar, data.userId)
      .input("content", sql.VarChar, data.content)
      .input("createdAt", sql.DateTime2, now)
      .query(`
        INSERT INTO ChatMessages (id, conversationId, userId, content, createdAt)
        VALUES (@id, @conversationId, @userId, @content, @createdAt)
      `);

    // Update conversation updatedAt timestamp
    await this.pool
      .request()
      .input("conversationId", sql.VarChar, data.conversationId)
      .input("updatedAt", sql.DateTime2, now)
      .query(`
        UPDATE ChatConversations
        SET updatedAt = @updatedAt
        WHERE id = @conversationId
      `);

    return {
      id: messageId,
      conversationId: data.conversationId,
      userId: data.userId,
      content: data.content,
      createdAt: now.toISOString(),
    };
  }

  async deleteChatMessage(messageId: string, userId: string): Promise<boolean> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    // Check if message exists and belongs to the user
    const checkResult = await this.pool
      .request()
      .input("messageId", sql.VarChar, messageId)
      .input("userId", sql.VarChar, userId)
      .query("SELECT id FROM ChatMessages WHERE id = @messageId AND userId = @userId");

    if (checkResult.recordset.length === 0) {
      return false;
    }

    await this.pool
      .request()
      .input("messageId", sql.VarChar, messageId)
      .query("DELETE FROM ChatMessages WHERE id = @messageId");

    return true;
  }

  //  Utility 

  async recordAction(data: {
    userId: string;
    groupId?: string | null;
    action: string;
    actionInformation: string;
  }): Promise<ActionLog> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const id = uuid();
    const now = new Date().toISOString();
    const user = await this.getUserById(data.userId);
    const role = user?.role ?? "USER";

    await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .input("userId", sql.VarChar, data.userId)
      .input("groupId", sql.VarChar, data.groupId ?? null)
      .input("role", sql.VarChar, role)
      .input("action", sql.VarChar, data.action)
      .input("actionInformation", sql.VarChar, data.actionInformation)
      .input("createdAt", sql.DateTime2, now)
      .query(`
        INSERT INTO ActionLogs (id, userId, groupId, role, action, actionInformation, createdAt)
        VALUES (@id, @userId, @groupId, @role, @action, @actionInformation, @createdAt)
      `);

    await this.detectSuspiciousBehaviour(data.userId);
    return { id, ...data, groupId: data.groupId ?? null, role, createdAt: now };
  }

  private async detectSuspiciousBehaviour(userId: string): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");

    const result = await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .query(`
        SELECT COUNT(*) AS actionCount
        FROM ActionLogs
        WHERE userId = @userId
          AND action IN ('DELETE_SUGGESTION', 'DELETE_GROUP', 'VOTE_DOWN')
          AND createdAt >= DATEADD(minute, -15, SYSUTCDATETIME())
      `);

    const actionCount = Number(result.recordset[0]?.actionCount ?? 0);
    if (actionCount < 3) return;

    await this.pool
      .request()
      .input("id", sql.VarChar, uuid())
      .input("userId", sql.VarChar, userId)
      .input("reason", sql.VarChar, "High-risk destructive or negative action burst in 15 minutes")
      .input("severity", sql.VarChar, actionCount >= 5 ? "high" : "medium")
      .input("actionCount", sql.Int, actionCount)
      .input("createdAt", sql.DateTime2, new Date().toISOString())
      .query(`
        MERGE ObservationList AS target
        USING (SELECT @userId AS userId) AS source
        ON target.userId = source.userId
        WHEN MATCHED THEN UPDATE SET reason = @reason, severity = @severity, actionCount = @actionCount
        WHEN NOT MATCHED THEN INSERT (id, userId, reason, severity, actionCount, createdAt)
          VALUES (@id, @userId, @reason, @severity, @actionCount, @createdAt);
      `);
  }

  async getActionLogs(): Promise<ActionLog[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .query("SELECT * FROM ActionLogs ORDER BY createdAt DESC");
    return result.recordset as ActionLog[];
  }

  async getObservationList(): Promise<ObservationEntry[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .query("SELECT * FROM ObservationList ORDER BY createdAt DESC");
    return Promise.all(
      (result.recordset as ObservationEntry[]).map(async (entry) => ({
        ...entry,
        user: await this.getUserById(entry.userId),
      }))
    );
  }

  async createObservation(data: Omit<ObservationEntry, "id" | "createdAt" | "user">): Promise<ObservationEntry> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const id = uuid();
    const createdAt = new Date().toISOString();
    await this.pool
      .request()
      .input("id", sql.VarChar, id)
      .input("userId", sql.VarChar, data.userId)
      .input("reason", sql.VarChar, data.reason)
      .input("severity", sql.VarChar, data.severity)
      .input("actionCount", sql.Int, data.actionCount)
      .input("createdAt", sql.DateTime2, createdAt)
      .query(`
        MERGE ObservationList AS target
        USING (SELECT @userId AS userId) AS source
        ON target.userId = source.userId
        WHEN MATCHED THEN UPDATE SET reason = @reason, severity = @severity, actionCount = @actionCount
        WHEN NOT MATCHED THEN INSERT (id, userId, reason, severity, actionCount, createdAt)
          VALUES (@id, @userId, @reason, @severity, @actionCount, @createdAt);
      `);
    return {
      ...data,
      id,
      createdAt,
      user: await this.getUserById(data.userId),
    };
  }

  async getRecentActionLogs(userId: string, limit = 25): Promise<ActionLog[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool
      .request()
      .input("userId", sql.VarChar, userId)
      .input("limit", sql.Int, limit)
      .query("SELECT TOP (@limit) * FROM ActionLogs WHERE userId = @userId ORDER BY createdAt DESC");
    return result.recordset as ActionLog[];
  }

  async getTopContributors(options?: { optimized?: boolean }): Promise<TopContributor[]> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const optimizedHint = options?.optimized ? "WITH fast grouped aggregate" : "WITH naive join aggregate";
    const result = await this.pool.request().query(`
      -- ${optimizedHint}
      SELECT TOP 20
        u.id AS userId,
        u.username,
        u.name,
        COUNT(DISTINCT gm.groupId) AS groupCount,
        COUNT(DISTINCT s.id) AS suggestionCount,
        COALESCE(SUM(CASE WHEN sv.vote = 'up' THEN 1 WHEN sv.vote = 'down' THEN -1 ELSE 0 END), 0) AS netScore
      FROM Users u
      LEFT JOIN GroupMembers gm ON gm.userId = u.id
      LEFT JOIN Suggestions s ON s.authorId = u.id
      LEFT JOIN SuggestionVotes sv ON sv.suggestionId = s.id
      GROUP BY u.id, u.username, u.name
      ORDER BY netScore DESC, suggestionCount DESC
    `);
    return result.recordset as TopContributor[];
  }

  async reset(): Promise<void> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const request = this.pool.request();
    await request.query("DELETE FROM ObservationList;");
    await request.query("DELETE FROM ActionLogs;");
    await request.query("DELETE FROM AlchemyVotes;");
    await request.query("DELETE FROM AlchemySourceIds;");
    await request.query("DELETE FROM SuggestionVotes;");
    await request.query("DELETE FROM AlchemyResults;");
    await request.query("DELETE FROM Suggestions;");
    await request.query("DELETE FROM GroupMembers;");
    await request.query("DELETE FROM Groups;");
    await request.query("DELETE FROM UserRoles;");
    await request.query("DELETE FROM RefreshTokens;");
    await request.query("DELETE FROM Users;");
  }

  async counts(): Promise<{
    users: number;
    groups: number;
    suggestions: number;
    alchemyResults: number;
  }> {
    if (!this.pool) throw new Error("Connection pool not initialized");
    const result = await this.pool.request().query(`
      SELECT
        (SELECT COUNT(*) FROM Users) as users,
        (SELECT COUNT(*) FROM Groups) as groups,
        (SELECT COUNT(*) FROM Suggestions) as suggestions,
        (SELECT COUNT(*) FROM AlchemyResults) as alchemyResults
    `);
    return result.recordset[0];
  }
}

export default MSSQLStore;
