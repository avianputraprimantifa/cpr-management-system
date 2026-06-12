import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, profile, roles, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (profile?.must_reset_password && location.pathname !== "/account/password/setup") {
    return <Navigate to="/account/password/setup" replace state={{ from: location.pathname }} />;
  }
  if (allowedRoles && !allowedRoles.some((r) => roles.includes(r))) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
