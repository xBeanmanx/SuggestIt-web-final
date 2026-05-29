import { describe, expect, it } from "vitest";
import { createTypeOrmDataSource, typeormEntities } from "../orm/typeorm-schemas.js";
import { createTestServer, getData, getErrors, seedUser } from "./helpers.js";

describe("TypeORM persistence mapping", () => {
  it("models every persistent table as a TypeORM entity schema", () => {
    const tableNames = typeormEntities.map((entity) => entity.options.tableName);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "Users",
        "Roles",
        "Permissions",
        "RolePermissions",
        "UserRoles",
        "RefreshTokens",
        "Groups",
        "GroupMembers",
        "Suggestions",
        "SuggestionVotes",
        "AlchemyResults",
        "AlchemySourceIds",
        "AlchemyVotes",
        "ActionLogs",
        "ObservationList",
      ])
    );
  });

  it("maps domain relationships through TypeORM relations", () => {
    const suggestions = typeormEntities.find((entity) => entity.options.tableName === "Suggestions");
    expect(suggestions).toBeDefined();
    expect(Object.keys(suggestions!.options.relations ?? {})).toEqual(
      expect.arrayContaining(["group", "author"])
    );
  });

  it("keeps derived aggregates out of base tables for 3NF", () => {
    const groups = typeormEntities.find((entity) => entity.options.tableName === "Groups")!;
    const suggestions = typeormEntities.find((entity) => entity.options.tableName === "Suggestions")!;

    expect(Object.keys(groups.options.columns ?? {})).not.toContain("memberCount");
    expect(Object.keys(groups.options.columns ?? {})).not.toContain("suggestionCount");
    expect(Object.keys(suggestions.options.columns ?? {})).not.toContain("upvotes");
    expect(Object.keys(suggestions.options.columns ?? {})).not.toContain("downvotes");
  });

  it("configures SQL Server TypeORM synchronization", () => {
    const dataSource = createTypeOrmDataSource({
      server: "localhost",
      database: "SuggestIt",
      user: "sa",
      password: "test",
      options: { trustServerCertificate: true },
    });
    expect(dataSource.options.type).toBe("mssql");
    expect(dataSource.options.synchronize).toBe(true);
    expect(dataSource.options.entities).toHaveLength(typeormEntities.length);
  });
});

describe("role, permission and logging infrastructure", () => {
  it("registers a new persisted user with restricted permissions by default after admins exist", async () => {
    const env = createTestServer();
    await env.server.start();
    seedUser(env.store, { name: "Existing Admin", username: "admin", email: "admin@test.local" });

    const result = await env.execute(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) {
          accessToken
          user { id name email role permissions }
        }
      }`,
      { input: { username: "normal", name: "Normal User", email: "normal@test.local", password: "password123" } }
    );

    const data = getData<{
      register: { accessToken: string; user: { id: string; email: string; role: string; permissions: string[] } };
    }>(result);
    expect(data.register.accessToken).toBeTruthy();
    expect(data.register.user.id).toBeTruthy();
    expect(data.register.user.email).toBe("normal@test.local");
    expect(data.register.user.role).toBe("USER");
    expect(data.register.user.permissions).toEqual(["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS"]);
    await env.server.stop();
  });

  it("keeps ADMIN and USER role permissions queryable", async () => {
    const env = createTestServer();
    await env.server.start();

    const result = await env.execute(`query AccessInfra {
      roles { name }
      permissions { code }
    }`);

    const data = getData<{ roles: { name: string }[]; permissions: { code: string }[] }>(result);
    expect(data.roles.map((role) => role.name)).toEqual(expect.arrayContaining(["ADMIN", "USER"]));
    expect(data.permissions.map((permission) => permission.code)).toEqual(
      expect.arrayContaining(["READ_DOMAIN", "WRITE_OWN_SUGGESTIONS", "ADMINISTER_DOMAIN"])
    );
    await env.server.stop();
  });

  it("places users with repeated risky actions on the observation list", async () => {
    const env = createTestServer();
    await env.server.start();
    const user = seedUser(env.store, { name: "Risky User" });

    await env.store.recordAction({ userId: user.id, action: "VOTE_DOWN", actionInformation: "Downvote 1" });
    await env.store.recordAction({ userId: user.id, action: "DELETE_SUGGESTION", actionInformation: "Delete 1" });
    await env.store.recordAction({ userId: user.id, action: "DELETE_GROUP", actionInformation: "Delete group" });

    const result = await env.execute(`query ObservationList {
      actionLogs { action userId }
      observationList { userId severity actionCount reason user { id name } }
    }`, undefined, {
      userId: user.id,
      role: "ADMIN",
      permissions: ["VIEW_SECURITY_LOGS"],
    });

    const data = getData<{
      actionLogs: { action: string }[];
      observationList: { userId: string; severity: string; actionCount: number }[];
    }>(result);
    expect(data.actionLogs).toHaveLength(3);
    expect(data.observationList[0]).toMatchObject({
      userId: user.id,
      severity: "medium",
      actionCount: 3,
    });
    await env.server.stop();
  });

  it("requires security-log permission for action logs and observations", async () => {
    const env = createTestServer();
    await env.server.start();
    const user = seedUser(env.store, { name: "Normal User" });

    const result = await env.execute(`query ObservationList {
      actionLogs { action userId }
      observationList { userId severity }
    }`, undefined, {
      userId: user.id,
      role: "USER",
      permissions: ["READ_DOMAIN"],
    });

    expect((result as any).body.singleResult.errors[0].extensions.code).toBe("FORBIDDEN");
    await env.server.stop();
  });

  it("allows an administrator to assign another user as ADMIN", async () => {
    const env = createTestServer();
    await env.server.start();
    const admin = seedUser(env.store, { name: "Admin User", username: "admin", email: "admin@test.local" });
    const user = await env.store.createUser({
      name: "Promoted User",
      username: "promoted",
      email: "promoted@test.local",
      password: "password123",
      role: "USER",
    });

    const result = await env.execute(
      `mutation SetUserRole($userId: ID!, $role: AppRoleName!) {
        setUserRole(userId: $userId, role: $role) {
          id
          role
          permissions
        }
      }`,
      { userId: user.id, role: "ADMIN" },
      {
        userId: admin.id,
        role: "ADMIN",
        permissions: ["ADMINISTER_DOMAIN"],
      }
    );

    const data = getData<{ setUserRole: { id: string; role: string; permissions: string[] } }>(result);
    expect(data.setUserRole).toMatchObject({ id: user.id, role: "ADMIN" });
    expect(data.setUserRole.permissions).toEqual(expect.arrayContaining(["ADMINISTER_DOMAIN"]));
    await env.server.stop();
  });

  it("rejects role assignment from non-admin users", async () => {
    const env = createTestServer();
    await env.server.start();
    const target = seedUser(env.store, { name: "Target User" });
    const normalUser = await env.store.createUser({
      name: "Normal User",
      username: "normal-user",
      email: "normal-user@test.local",
      password: "password123",
      role: "USER",
    });

    const result = await env.execute(
      `mutation SetUserRole($userId: ID!, $role: AppRoleName!) {
        setUserRole(userId: $userId, role: $role) { id role }
      }`,
      { userId: target.id, role: "ADMIN" },
      {
        userId: normalUser.id,
        role: "USER",
        permissions: ["READ_DOMAIN"],
      }
    );

    expect(getErrors(result)[0].extensions?.code).toBe("FORBIDDEN");
    await env.server.stop();
  });
});
