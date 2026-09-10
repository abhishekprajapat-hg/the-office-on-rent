import { memo, useCallback, useMemo, useState } from "react";
import { useChatNotifications } from "../../context/useChatNotifications";
import { usePermissions } from "../../context/usePermissions";
import { cn } from "../ui";
import AppTopCommandBar from "./AppTopCommandBar";
import PrimarySidebar from "./PrimarySidebar";

const WorkbenchShell = ({
  children,
  userRole,
  user,
  roleLabel,
  theme,
  onToggleTheme,
  onLogout,
  pageHeader,
  isChatPage = false,
  shouldLockDocumentScroll = true,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { adminRequestUnread, unreadTotal } = useChatNotifications();
  const { permissions, enforcePageAccess, loading: permissionsLoading } = usePermissions();
  const userForNav = useMemo(
    () => ({
      ...(user || {}),
      permissions: permissionsLoading ? null : permissions,
      enforcePageAccess: permissionsLoading ? false : enforcePageAccess,
    }),
    [user, permissions, enforcePageAccess, permissionsLoading],
  );
  const handleOpenMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const handleCloseMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <div
      className={cn(
        "workspace-shell flex w-full bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-100",
        shouldLockDocumentScroll ? "h-dvh overflow-hidden" : "min-h-screen",
      )}
    >
      <PrimarySidebar
        userRole={userRole}
        user={userForNav}
        roleLabel={roleLabel}
        onLogout={onLogout}
        mobileOpen={mobileMenuOpen}
        onMobileClose={handleCloseMobileMenu}
        unreadChats={unreadTotal}
        unreadAlerts={adminRequestUnread}
      />

      <main className="workspace-main app-page-bg relative min-w-0 flex flex-1 flex-col overflow-hidden">
          <AppTopCommandBar
            className={isChatPage ? "md:hidden" : undefined}
            user={user}
            unreadAlerts={adminRequestUnread}
            pageHeader={isChatPage ? { title: "Team Chat" } : pageHeader}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onMenuOpen={handleOpenMobileMenu}
          />
        <div
          className={cn(
            "workspace-main-content min-h-0 flex-1 overflow-hidden",
            isChatPage ? "workspace-main-content-chat" : "workspace-main-content-mobile-nav",
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
};

export default memo(WorkbenchShell);
