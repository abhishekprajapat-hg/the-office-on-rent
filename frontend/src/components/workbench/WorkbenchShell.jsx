import { useMemo, useState } from "react";
import { motion as Motion } from "framer-motion";
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
  const { adminRequestUnread } = useChatNotifications();
  const userForNav = useMemo(() => user || {}, [user]);

  return (
    <Motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
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
        onMobileMenuOpen={() => setMobileMenuOpen(true)}
      />
      <PrimarySidebar
        userRole={userRole}
        user={userForNav}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      <main className="workspace-main app-page-bg relative min-w-0 flex flex-1 flex-col overflow-hidden">
        <TopNavigation
          userRole={userRole}
          user={userForNav}
          unreadAlerts={adminRequestUnread}
          onMenuOpen={() => setMobileMenuOpen(true)}
        />
        <AppTopCommandBar
          pageHeader={pageHeader}
          roleLabel={roleLabel}
          isChatPage={isChatPage}
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
    </Motion.div>
  );
};

export default WorkbenchShell;
