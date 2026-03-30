import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import type { Role } from "../types/portal";

export function ProtectedRoute() {
  const { initialized, user } = useAuth();
  const { t } = useI18n();

  if (!initialized) {
    return <div className="screen-center">{t("k_035")}</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AuthRoute() {
  const { initialized, user } = useAuth();
  const { t } = useI18n();

  if (!initialized) {
    return <div className="screen-center">{t("k_036")}</div>;
  }

  if (user) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ roles }: { roles: Role[] }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <Outlet />;
}

