import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import {
  loginUser,
  registerUser,
  requestMagicLink,
  requestPasswordReset,
  resetPassword,
  verifyLoginCode,
  verifyMagicLink,
} from "../../api/graphql";
import type { LoginChallenge } from "../../types";
import type { User } from "../../types";

interface LoginPageProps {
  onLogin: (user: User) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const [loginCode, setLoginCode] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [demoLink, setDemoLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        const nextChallenge = await loginUser({ username, password });
        setChallenge(nextChallenge);
        setDemoLink(
          nextChallenge.delivery === "console" && nextChallenge.demoCode
            ? `Email code for local demo: ${nextChallenge.demoCode}`
            : `A login code was sent to ${nextChallenge.email}.`
        );
        setIsLoading(false);
        return;
      }

      const payload = await registerUser({ username, email, password, name });
      onLogin(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = await verifyLoginCode(challenge.challengeId, loginCode);
      onLogin(payload.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code verification failed");
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const magicToken = params.get("token");
    if (!magicToken || !window.location.pathname.includes("magic-login")) return;
    setIsLoading(true);
    verifyMagicLink(magicToken)
      .then((payload) => onLogin(payload.user))
      .catch((err) => setError(err instanceof Error ? err.message : "Magic link failed"))
      .finally(() => setIsLoading(false));
  }, [onLogin]);

  const handleMagicLink = async () => {
    setError(null);
    setDemoLink(null);
    try {
      const link = await requestMagicLink(email || username);
      setDemoLink(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Magic link request failed");
    }
  };

  const handlePasswordReset = async () => {
    setError(null);
    setDemoLink(null);
    try {
      const params = new URLSearchParams(window.location.search);
      const resetToken = params.get("token");
      if (resetToken && window.location.pathname.includes("reset-password")) {
        await resetPassword(resetToken, password);
        setDemoLink("Password updated. You can sign in with the new password.");
        return;
      }
      const link = await requestPasswordReset(email || username);
      const token = link.includes("token=") ? new URL(link, window.location.origin).searchParams.get("token") : null;
      setResetToken(token);
      setDemoLink(token ? "Password reset code generated. Enter a new password below." : link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">SuggestIt</h1>
          <p className="text-gray-600">Share ideas and make decisions together</p>
        </div>

        <div className="flex gap-2 mb-6 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "register" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
            }`}
          >
            Register
          </button>
        </div>

        {challenge ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label htmlFor="login-code" className="block text-sm font-medium text-gray-700 mb-1">
                Email verification code
              </label>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                placeholder="Enter the 6-digit code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                disabled={isLoading}
                required
              />
            </div>

            {demoLink && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm text-indigo-800 break-words">{demoLink}</p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoading || !loginCode}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-base font-medium"
            >
              Verify code
            </Button>
            <button
              type="button"
              onClick={() => {
                setChallenge(null);
                setLoginCode("");
                setDemoLink(null);
              }}
              className="w-full text-sm text-gray-600 hover:text-gray-900"
            >
              Use different credentials
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Display name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  disabled={isLoading}
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  disabled={isLoading}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              disabled={isLoading}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              disabled={isLoading}
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {demoLink && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm text-indigo-800 break-words">{demoLink}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isLoading || !username || !password || (mode === "register" && (!name || !email))}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white h-12 text-base font-medium"
          >
            {isLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Signing in...</span>
              </div>
            ) : (
              mode === "login" ? "Sign in" : "Create account"
            )}
          </Button>
        </form>
        )}

        {resetToken && (
          <div className="mt-4 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <label htmlFor="new-password" className="block text-sm font-medium text-indigo-900">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full px-4 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                setError(null);
                try {
                  await resetPassword(resetToken, newPassword);
                  setDemoLink("Password updated. Sign in with your new password.");
                  setResetToken(null);
                  setNewPassword("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Password reset failed");
                }
              }}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              Save new password
            </button>
          </div>
        )}



        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}
