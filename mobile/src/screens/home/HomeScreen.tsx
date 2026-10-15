import React from "react";
import { useUser } from "../../auth/AuthProvider";
import { homeKindFor } from "../../lib/roleHome";
import { AdminHome, CommunityHome, FieldHome, ManagerHome, ProductionHome, SalesHome } from "./RoleHomes";

/* "Home by Role": one home per role (A Admin … F Production executive). */
export const HomeScreen = () => {
  const user = useUser();
  switch (homeKindFor(user.role)) {
    case "admin":
      return <AdminHome />;
    case "manager":
      return <ManagerHome />;
    case "field":
      return <FieldHome />;
    case "community":
      return <CommunityHome />;
    case "production":
      return <ProductionHome />;
    case "partner":
      return <SalesHome partner />;
    default:
      return <SalesHome />;
  }
};
