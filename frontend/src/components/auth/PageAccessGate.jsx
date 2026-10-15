import { Lock } from "lucide-react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../../context/usePermissions";
import { EmptyState, Skeleton } from "../ui";

// The server resolves both role defaults and employee page selections.
const PageAccessGate = ({ page, allowedRoles, children }) => {
  const { canPage, isAdmin, role, loading } = usePermissions();

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (page && !canPage(page)) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Lock}
          title="You do not have access to this page"
          description="Your account does not include this page. Ask an admin to update your page access."
        />
      </div>
    );
  }

  // These API families stay role-only even with an explicit page grant.
  if (["admin_team", "admin_notifications", "admin_console", "admin_meta_ads", "settings"].includes(page)
    && allowedRoles && !isAdmin && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default PageAccessGate;
