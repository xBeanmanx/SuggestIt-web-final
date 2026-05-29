import { describe, expect, it } from "vitest";
import { createTestServer, getData, getErrors } from "./helpers.js";
import {
  clearRefreshCookie,
  consumeMfaChallenge,
  createMfaChallenge,
  createSignedFlowToken,
  hashRefreshToken,
  issueRefreshToken,
  parseCookies,
  refreshCookie,
  signAccessToken,
} from "../auth.js";

describe("authentication", () => {
  it("rejects the wrong password and requires an email code before returning a token", async () => {
    const env = createTestServer();
    await env.server.start();
    await env.store.createUser({
      username: "secure_user",
      email: "secure@test.local",
      name: "Secure User",
      password: "correct-password",
      role: "USER",
      permissions: [],
    });

    const mutation = `mutation Login($input: LoginInput!) {
      login(input: $input) {
        challengeId
        email
        demoCode
      }
    }`;

    const bad = await env.execute(mutation, {
      input: { username: "secure_user", password: "wrong-password" },
    });
    expect(getErrors(bad)[0]?.extensions?.code).toBe("UNAUTHENTICATED");

    const good = await env.execute(mutation, {
      input: { username: "secure_user", password: "correct-password" },
    });
    const data = getData<{
      login: { challengeId: string; email: string; demoCode: string };
    }>(good);
    expect(data.login.challengeId).toBeTruthy();
    expect(data.login.email).toBe("secure@test.local");
    expect(data.login.demoCode).toMatch(/^\d{6}$/);

    const verified = await env.execute(
      `mutation VerifyLoginCode($challengeId: String!, $code: String!) {
        verifyLoginCode(challengeId: $challengeId, code: $code) {
          accessToken
          user { username role }
        }
      }`,
      { challengeId: data.login.challengeId, code: data.login.demoCode }
    );
    const verifiedData = getData<{
      verifyLoginCode: { accessToken: string; user: { username: string; role: string } };
    }>(verified);
    expect(verifiedData.verifyLoginCode.accessToken).toBeTruthy();
    expect(verifiedData.verifyLoginCode.user.username).toBe("secure_user");
    await env.server.stop();
  });

  it("rejects duplicate registration usernames and emails", async () => {
    const env = createTestServer();
    await env.server.start();

    const mutation = `mutation Register($input: RegisterInput!) {
      register(input: $input) { accessToken user { id } }
    }`;

    await env.execute(mutation, {
      input: {
        username: "dupe",
        email: "dupe@test.local",
        name: "First",
        password: "password123",
      },
    });

    const duplicateUsername = await env.execute(mutation, {
      input: {
        username: "dupe",
        email: "other@test.local",
        name: "Second",
        password: "password123",
      },
    });
    expect(getErrors(duplicateUsername)[0]?.message).toContain("Username is already registered");

    const duplicateEmail = await env.execute(mutation, {
      input: {
        username: "other",
        email: "dupe@test.local",
        name: "Second",
        password: "password123",
      },
    });
    expect(getErrors(duplicateEmail)[0]?.message).toContain("Email is already registered");
    await env.server.stop();
  });

  it("does not allow public registration to self-assign ADMIN", async () => {
    const env = createTestServer();
    await env.server.start();

    const result = await env.execute(
      `mutation Register($input: RegisterInput!) {
        register(input: $input) { user { role permissions } }
      }`,
      {
        input: {
          username: "not_admin",
          email: "not-admin@test.local",
          name: "Not Admin",
          password: "password123",
          requestedRole: "ADMIN",
        },
      }
    );

    const data = getData<{ register: { user: { role: string; permissions: string[] } } }>(result);
    expect(data.register.user.role).toBe("USER");
    expect(data.register.user.permissions).not.toContain("ADMINISTER_DOMAIN");
    await env.server.stop();
  });

  it("does not return magic or reset tokens directly from request mutations", async () => {
    const env = createTestServer();
    await env.server.start();
    await env.store.createUser({
      username: "link_user",
      email: "link-user@test.local",
      name: "Link User",
      password: "password123",
      role: "USER",
      permissions: [],
    });

    const magic = await env.execute(
      `mutation RequestMagicLink($email: String!) { requestMagicLink(email: $email) }`,
      { email: "link-user@test.local" }
    );
    const reset = await env.execute(
      `mutation RequestPasswordReset($email: String!) { requestPasswordReset(email: $email) }`,
      { email: "missing@test.local" }
    );

    expect(getData<{ requestMagicLink: string }>(magic).requestMagicLink).toBe(
      "If the email exists, a login link was generated."
    );
    expect(getData<{ requestPasswordReset: string }>(reset).requestPasswordReset).toBe(
      "If the email exists, a reset link was generated."
    );
    expect(getData<{ requestMagicLink: string }>(magic).requestMagicLink).not.toContain("token=");
    await env.server.stop();
  });

  it("rejects the default JWT secret in production", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;

    expect(() =>
      signAccessToken({
        id: "user-1",
        email: "user@test.local",
        name: "User",
        createdAt: new Date().toISOString(),
        role: "USER",
        permissions: [],
      })
    ).toThrow("JWT_SECRET must be set");

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwtSecret;
  });

  it("limits MFA challenge attempts and prevents replay after success", () => {
    const challenge = createMfaChallenge("user-1");

    for (let index = 0; index < 4; index += 1) {
      expect(consumeMfaChallenge(challenge.challengeId, "000000")).toBeUndefined();
    }

    expect(consumeMfaChallenge(challenge.challengeId, challenge.demoCode)).toBe("user-1");
    expect(consumeMfaChallenge(challenge.challengeId, challenge.demoCode)).toBeUndefined();

    const lockedChallenge = createMfaChallenge("user-2");
    for (let index = 0; index < 5; index += 1) {
      expect(consumeMfaChallenge(lockedChallenge.challengeId, "111111")).toBeUndefined();
    }
    expect(consumeMfaChallenge(lockedChallenge.challengeId, lockedChallenge.demoCode)).toBeUndefined();
  });

  it("adds Secure to refresh cookies when HTTPS is enabled", () => {
    const originalDisableHttps = process.env.DISABLE_HTTPS;
    delete process.env.DISABLE_HTTPS;

    expect(refreshCookie("token", new Date("2030-01-01T00:00:00.000Z"))).toContain("Secure");
    expect(clearRefreshCookie()).toContain("Secure");

    if (originalDisableHttps === undefined) delete process.env.DISABLE_HTTPS;
    else process.env.DISABLE_HTTPS = originalDisableHttps;
  });

  it("parses malformed cookie values without throwing", () => {
    expect(parseCookies("valid=value; bad=%E0%A4%A")).toEqual({
      valid: "value",
      bad: "%E0%A4%A",
    });
  });

  it("revokes outstanding refresh tokens after password reset", async () => {
    const env = createTestServer();
    await env.server.start();
    const user = await env.store.createUser({
      username: "reset_user",
      email: "reset@test.local",
      name: "Reset User",
      password: "old-password",
      role: "USER",
      permissions: [],
    });
    const refresh = await issueRefreshToken(env.store, user.id);
    const resetToken = createSignedFlowToken(user.id, "password-reset");

    const result = await env.execute(
      `mutation ResetPassword($token: String!, $newPassword: String!) {
        resetPassword(token: $token, newPassword: $newPassword)
      }`,
      { token: resetToken, newPassword: "new-password-123" }
    );

    expect(getData<{ resetPassword: boolean }>(result).resetPassword).toBe(true);
    const record = await env.store.getRefreshToken(hashRefreshToken(refresh.token));
    expect(record?.revokedAt).toBeTruthy();
    await env.server.stop();
  });
});
