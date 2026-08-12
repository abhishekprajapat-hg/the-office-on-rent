import { Navigate } from "react-router-dom";
import { usePermissions } from "../../context/usePermissions";
import { Skeleton } from "../ui";

// Second, finer-grained gate layered on top of the role check already applied
// in App.jsx's route table. Role gets you into /coworking/*; permission
// decides which pages inside it you can actually open. The API enforces the
// same permission independently (see requirePermission on the backend) —
// this only controls what renders client-side.
const CoworkingPermissionGate = ({ permission, children }) => {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (permission && !can(permission)) {
    return <Navigate to="/coworking/dashboard" replace />;
  }

  return children;
};

export default CoworkingPermissionGate;
