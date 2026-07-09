import { memo, useCallback, useMemo, useState } from "react";
import { useChatNotifications } from "../../context/useChatNotifications";
import { cn } from "../ui";
import ActivityBar from "./ActivityBar";
import AppTopCommandBar from "./AppTopCommandBar";
import PrimarySidebar from "./PrimarySidebar";
import TopNavigation from "./TopNavigation";

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
  const userForNav = useMemo(() => user || {}, [user]);
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
      <ActivityBar
        userRole={userRole}
        user={userForNav}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        unreadAlerts={adminRequestUnread}
        unreadChats={unreadTotal}
        onMobileMenuOpen={handleOpenMobileMenu}
      />
      <PrimarySidebar
        userRole={userRole}
        user={userForNav}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={handleToggleSidebar}
        mobileOpen={mobileMenuOpen}
        onMobileClose={handleCloseMobileMenu}
        unreadChats={unreadTotal}
      />

      <main className="workspace-main app-page-bg relative min-w-0 flex flex-1 flex-col overflow-hidden">
        <TopNavigation
          userRole={userRole}
          user={userForNav}
          unreadAlerts={adminRequestUnread}
          unreadChats={unreadTotal}
          onMenuOpen={handleOpenMobileMenu}
        />
        {!isChatPage ? (
          <AppTopCommandBar
            pageHeader={pageHeader}
            roleLabel={roleLabel}
          />
        ) : null}
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
