import { createContext, useContext, type ReactNode } from "react";

interface AuthContextType {
  logout: () => void | Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
  onLogout,
}: {
  children: ReactNode;
  onLogout: () => void | Promise<void>;
}) {
  return (
    <AuthContext.Provider value={{ logout: onLogout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
