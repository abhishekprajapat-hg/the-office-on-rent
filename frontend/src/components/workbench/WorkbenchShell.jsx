import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useChatNotifications } from "../../context/useChatNotifications";
import { usePermissions } from "../../context/usePermissions";
import { cn } from "../ui";
import AppTopCommandBar from "./AppTopCommandBar";
import FloatingMessenger from "./FloatingMessenger";
import { useIsMobileViewport } from "../../hooks/useIsMobileViewport";
import { getAllVisibleMenuGroups } from "./workbenchNavigation";
import PrimarySidebar from "./PrimarySidebar";
import RouteLoadingSkeleton from "../layout/RouteLoadingSkeleton";

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
  const isMobileViewport = useIsMobileViewport();
  const { adminRequestUnread, unreadTotal } = useChatNotifications();
  const { permissions, enforcePageAccess, loading: permissionsLoading } = usePermissions();
  const location = useLocation();
  const contentRef = useRef(null);
  const userForNav = useMemo(
    () => ({
      ...(user || {}),
      permissions: permissionsLoading ? null : permissions,
      enforcePageAccess: permissionsLoading ? false : enforcePageAccess,
    }),
    [user, permissions, enforcePageAccess, permissionsLoading],
  );
  /*
   * Resolved exactly as the header resolves it, falling back to the user's own
   * role, so the chat icon and the floating messenger always agree.
   */
  const canUseChat = useMemo(
    () => getAllVisibleMenuGroups(userRole || user?.role, userForNav)
      .some((group) => group.items.some((item) => item.path === "/chat")),
    [userRole, user, userForNav],
  );

  /*
   * Glass page transition: replay a short fade/rise/un-blur on the content
   * area whenever the page changes. The class is toggled on the existing node
   * (no remount, so page state survives), and the animation does not persist
   * its transform afterwards - a lingering transform would trap `fixed`
   * dialogs inside the content area.
   */
  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    node.classList.remove("gl-page-enter");
    void node.offsetWidth;
    node.classList.add("gl-page-enter");
    const done = () => node.classList.remove("gl-page-enter");
    node.addEventListener("animationend", done, { once: true });
    return () => node.removeEventListener("animationend", done);
  }, [location.pathname]);

  const handleOpenMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const handleCloseMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  return (
    <div
      className={cn(
        "workspace-shell gl-shell flex w-full",
        shouldLockDocumentScroll ? "h-dvh overflow-hidden" : "min-h-screen",
      )}
    >
      <PrimarySidebar
        userRole={userRole}
        user={userForNav}
        roleLabel={roleLabel}
        mobileOpen={mobileMenuOpen}
        onMobileClose={handleCloseMobileMenu}
      />

      <main className="workspace-main relative min-w-0 flex flex-1 flex-col">
          <AppTopCommandBar
            key={pageHeader?.title || (isChatPage ? "chat" : "workspace")}
            user={userForNav}
            userRole={userRole}
            onLogout={onLogout}
            unreadAlerts={adminRequestUnread}
            unreadChats={unreadTotal}
            pageHeader={isChatPage ? { title: "Team Chat" } : pageHeader}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onMenuOpen={handleOpenMobileMenu}
          />
        <div
          ref={contentRef}
          className={cn(
            "workspace-main-content min-h-0 flex-1 overflow-hidden",
            isChatPage ? "workspace-main-content-chat" : "workspace-main-content-mobile-nav",
          )}
        >
          {/* Pages load inside the shell, so sidebar and header stay while a page's code arrives. */}
          <Suspense fallback={<RouteLoadingSkeleton variant="content" />}>{children}</Suspense>
        </div>
      </main>
      {/*
        Desktop only. On a phone the messenger panel covers most of the screen,
        so the header's chat icon goes to the full /chat page instead.
      */}
      {!isMobileViewport && !isChatPage && canUseChat && <FloatingMessenger theme={theme} unreadTotal={unreadTotal} />}
    </div>
  );
};

export default memo(WorkbenchShell);
