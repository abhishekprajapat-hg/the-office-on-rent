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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { adminRequestUnread, unreadTotal } = useChatNotifications();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const userForNav = useMemo(
    () => ({ ...(user || {}), permissions: permissionsLoading ? null : permissions }),
    [user, permissions, permissionsLoading],
  );
  const handleOpenMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const handleCloseMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const handleToggleSidebar = useCallback(() => setSidebarCollapsed((prev) => !prev), []);

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
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
        mobileOpen={mobileMenuOpen}
        onMobileClose={handleCloseMobileMenu}
        unreadChats={unreadTotal}
        unreadAlerts={adminRequestUnread}
      />

      <main className="workspace-main app-page-bg relative min-w-0 flex flex-1 flex-col overflow-hidden">
        {!isChatPage ? (
          <AppTopCommandBar
            pageHeader={pageHeader}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onMenuOpen={handleOpenMobileMenu}
          />
        ) : (
          // Chat keeps its full-bleed desktop layout; mobile still needs a way
          // into the navigation drawer, which the old TopNavigation provided.
          <AppTopCommandBar
            className="md:hidden"
            pageHeader={{ title: "Team Chat" }}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onMenuOpen={handleOpenMobileMenu}
          />
        )}
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
