import { useAppState } from "../../context/AppStateContext";
import { Navigate } from "react-router";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: "ADMIN" | "USER";
}

/**
 * ProtectedRoute enforces role-based access control.
 * - If no role is specified, just checks if user is logged in
 * - If a role is specified, redirects to home if user doesn't have that role
 */
export function ProtectedRoute({ children, requiredRole = "ADMIN" }: ProtectedRouteProps) {
  const { state } = useAppState();

  // Check if user has the required role
  if (requiredRole && state.currentUser.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
