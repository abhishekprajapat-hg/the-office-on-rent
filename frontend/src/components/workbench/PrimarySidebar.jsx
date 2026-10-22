import { memo, useCallback, useLayoutEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronRight, X } from "lucide-react";
import { IconButton, cn } from "../ui";
import { getVisibleSidebarGroups } from "./workbenchNavigation";

const pathMatchesItem = (pathname, itemPath) => {
  if (itemPath === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  if (itemPath === "/coworking/booking-board") return pathname === "/coworking" || pathname === "/coworking/booking-board";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
};

/*
 * Glass sidebar (CRM Web Glass design): a floating pane with a lit pill that
 * slides to the active page. The pill is one absolutely-placed element
 * measured from the active row, so moving between pages animates it instead of
 * repainting a background on each row.
 */
const PrimarySidebar = ({
  userRole,
  user,
  roleLabel,
  mobileOpen,
  onMobileClose,
}) => {
  const location = useLocation();
  const groups = useMemo(() => getVisibleSidebarGroups(userRole, user).map((group) => ({ ...group, items: group.items.filter((item) => !["/admin/notifications", "/profile", "/chat"].includes(item.path)) })).filter((group) => group.items.length), [userRole, user]);

  // A parent entry like /inventory must not stay lit while a child page such as
  // /inventory/owners is open, or two rows read as active at once.
  const exactMatchPaths = useMemo(() => {
    const paths = groups.flatMap((group) => group.items.map((item) => item.path));
    return new Set(paths.filter((path) => paths.some((other) => other !== path && other.startsWith(`${path}/`))));
  }, [groups]);

  const isItemActive = useCallback((path) => {
    if (path === "/dashboard" || exactMatchPaths.has(path)) {
      return path === "/dashboard" ? pathMatchesItem(location.pathname, path) : location.pathname === path;
    }
    return pathMatchesItem(location.pathname, path);
  }, [exactMatchPaths, location.pathname]);

  const activeGroupName = useMemo(() => {
    const activeGroup = groups.find((group) => group.items.some((item) => isItemActive(item.path)));
    return activeGroup?.group || "SALES";
  }, [groups, isItemActive]);

  const [expandedGroupNames, setExpandedGroupNames] = useState(["SALES", "WORK"]);
  const [previousGroup, setPreviousGroup] = useState(null);
  if (previousGroup !== activeGroupName) {
    setPreviousGroup(activeGroupName);
    if (activeGroupName && !expandedGroupNames.includes(activeGroupName)) {
      setExpandedGroupNames([...expandedGroupNames, activeGroupName]);
    }
  }

  const [indicator, setIndicator] = useState({ top: 0, h: 38, show: false });

  const measure = useCallback(() => {
    const nav = document.querySelector(mobileOpen ? ".gl-sidebar-mobile .gl-nav" : ".gl-sidebar:not(.gl-sidebar-mobile) .gl-nav");
    const el = nav?.querySelector('[data-active="1"]');
    setIndicator((cur) => {
      const next = el ? { top: el.offsetTop, h: el.offsetHeight, show: true } : { ...cur, show: false };
      return next.top === cur.top && next.h === cur.h && next.show === cur.show ? cur : next;
    });
  }, [mobileOpen]);

  // Re-measure after the route or the open groups change; the second pass
  // catches the chevron/height transition settling.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(frame); clearTimeout(timer); window.removeEventListener("resize", measure); };
  }, [measure, location.pathname, expandedGroupNames, groups]);

  const toggleGroup = (name) => setExpandedGroupNames((current) => (
    current.includes(name) ? current.filter((n) => n !== name) : [...current, name]
  ));

  const renderNav = () => (
    <nav aria-label="Workbench navigation" className="gl-nav">
      <div
        aria-hidden="true"
        className="gl-nav-ind"
        style={{ top: indicator.top, height: indicator.h, opacity: indicator.show ? 1 : 0 }}
      />
      <div
        aria-hidden="true"
        className="gl-nav-bar"
        style={{ top: indicator.top + (indicator.h - 18) / 2, opacity: indicator.show ? 1 : 0 }}
      />
      {groups.map((group) => {
        const isExpanded = expandedGroupNames.includes(group.group);
        return (
          <div key={group.group} className="gl-nav-group">
            <button
              type="button"
              className="gl-nav-head"
              aria-expanded={isExpanded}
              onClick={() => toggleGroup(group.group)}
            >
              <span>{group.group}</span>
              <ChevronRight aria-hidden="true" size={13} strokeWidth={2.4} />
            </button>
            {isExpanded ? group.items.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item.path);
              return (
                <NavLink
                  key={`${group.group}-${item.path}`}
                  to={item.path}
                  end={item.path === "/dashboard" || exactMatchPaths.has(item.path)}
                  onClick={onMobileClose}
                  data-active={active ? "1" : "0"}
                  aria-current={active ? "page" : undefined}
                  className="gl-nav-item"
                >
                  {Icon ? <Icon aria-hidden="true" size={18} strokeWidth={active ? 2.3 : 1.9} /> : null}
                  <span>{item.label}</span>
                  {item.badge && !active ? <span className="gl-nav-badge">{item.badge}</span> : null}
                </NavLink>
              );
            }) : null}
          </div>
        );
      })}
    </nav>
  );

  const sidebar = ({ mobile = false } = {}) => (
    <aside className={cn("gl-sidebar", mobile && "gl-sidebar-mobile")}>
      <div className="gl-sidebar-brand">
        <div className="gl-sidebar-logo">
          <img src="/theofficeonrentlogo.png" alt="The Office On Rent" />
        </div>
        <div className="gl-sidebar-brand-row">
          <span className="gl-sidebar-role">{roleLabel || "Admin"}</span>
          {mobile ? <IconButton icon={X} label="Close navigation" size="sm" onClick={onMobileClose} /> : null}
        </div>
      </div>
      {groups.length > 0 ? (
        renderNav()
      ) : (
        <div className="flex flex-1 items-center px-4 text-[12.8px] font-semibold" style={{ color: "var(--g-bad)" }}>
          No accessible routes for this role.
        </div>
      )}
    </aside>
  );

  return (
    <>
      <div className="hidden h-full md:block">{sidebar()}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-[80] md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[3px]"
            onClick={onMobileClose}
          />
          {sidebar({ mobile: true })}
        </div>
      ) : null}
    </>
  );
};

export default memo(PrimarySidebar);
