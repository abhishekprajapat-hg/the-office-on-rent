import { Lock } from "lucide-react";
import { Navigate } from "react-router-dom";
import { usePermissions } from "../../context/usePermissions";
import { EmptyState, Skeleton } from "../ui";

// The single place that answers "may this account open this page".
//
// Two regimes, and which one applies depends on the account's role:
//
//   * Role has explicit page access configured (enforcePageAccess) — the Role
//     Type / Role configuration is authoritative. It both grants and revokes,
//     so a Production Executive an Admin gave Projects to actually gets
//     Projects, and one whose Reports grant was removed loses it. The built-in
//     `allowedRoles` list is not consulted at all.
//
//   * Role has no such configuration — every account that predates the Role
//     Types work, and every migrated system role — falls back to the built-in
//     role matrix exactly as before. Nothing changes for them.
//
// The route decision lives in this component rather than in App.jsx because
// App builds its route table outside PermissionProvider; only what renders
// underneath the provider can read the resolved access profile.
//
// The API applies the same rules independently (requirePageAccess and
// checkRoleOrPageAccess), which is what actually protects the data.
const PageAccessGate = ({ page, allowedRoles, children }) => {
  const { canPage, enforcePageAccess, isAdmin, role, loading } = usePermissions();

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const isConfiguredRole = enforcePageAccess && !isAdmin;

  if (isConfiguredRole) {
    if (page && !canPage(page)) {
      return (
        <div className="p-6">
          <EmptyState
            icon={Lock}
            title="You do not have access to this page"
            description="Your role does not include this page. Ask an admin to add it to your role's page access."
          />
        </div>
      );
    }
    return children;
  }

  // Unconfigured role: the built-in matrix decides, as it always has. Routes
  // that already did their own role check pass no allowedRoles.
  if (allowedRoles && !isAdmin && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default PageAccessGate;
