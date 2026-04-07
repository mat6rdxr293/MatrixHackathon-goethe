import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  MonitorPlay,
  School,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { roleLabelKey } from "../config/labels";
import { menuByRole, pageTitleByPath } from "../config/navigation";
import { LanguageSwitch } from "../components/ui/LanguageSwitch";

export function PortalLayout() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("aqbobek_sidebar_collapsed") === "1"; }
    catch { return false; }
  });

  const toggleCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("aqbobek_sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const initials = useMemo(() => {
    if (!user) {
      return "AQ";
    }
    const parts = user.name.trim().split(/\s+/);
    if (parts.length === 0) {
      return "AQ";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }, [user?.name]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) {
    return null;
  }

  const menu = menuByRole(user.role);
  const title = t(pageTitleByPath(location.pathname));

  return (
    <div className="portal-shell">
      <button
        type="button"
        className={sidebarOpen ? "portal-overlay show" : "portal-overlay"}
        onClick={() => setSidebarOpen(false)}
        aria-label={t("logout_button")}
      />

      <aside className={["portal-sidebar", sidebarOpen ? "open" : "", sidebarCollapsed ? "collapsed" : ""].filter(Boolean).join(" ")}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon">
            <School size={16} />
          </div>
          <div className="sidebar-brand-text">
            <h2>Matrix Education</h2>
            <p>{t("single_school_portal")}</p>
          </div>
          <button
            className="sidebar-collapse-btn"
            type="button"
            onClick={toggleCollapse}
            title={sidebarCollapsed ? t("expand") : t("collapse")}
          >
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
          </button>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">{initials}</div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name">{user.name}</div>
            <div className="sidebar-user-role">{t(roleLabelKey(user.role))}</div>
          </div>
        </div>

        <p className="sidebar-section-label">{t("portal_lyceum")}</p>

        <nav className="side-nav">
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? "side-link active" : "side-link")}
                title={sidebarCollapsed ? t(item.labelKey) : undefined}
              >
                <span className="side-link-icon">
                  <Icon size={15} />
                </span>
                <span className="side-link-text">{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="side-link side-link-logout" type="button" onClick={logout} title={sidebarCollapsed ? t("logout_button") : undefined}>
            <span className="side-link-icon">
              <LogOut size={15} />
            </span>
            <span className="side-link-text">{t("logout_button")}</span>
          </button>
        </div>
      </aside>

      <div className={`portal-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <header className="portal-topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-btn mobile-btn"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label={sidebarOpen ? t("logout_button") : t("portal_lyceum")}
            >
              {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <div>
              <div className="topbar-breadcrumb">
                <span>{t("portal_lyceum")}</span>
                <ChevronRight size={13} />
                <strong>{title}</strong>
              </div>
              <h1 className="topbar-title">{title}</h1>
            </div>
          </div>

          <div className="top-actions">
            <LanguageSwitch />
            <button className="icon-btn" type="button" onClick={() => navigate("/app/notifications")}>
              <Bell size={16} />
              <span className="notif-dot" />
            </button>
            {user.role === "admin" ? (
              <button className="outline-button icon-button" type="button" onClick={() => navigate("/kiosk")}>
                <MonitorPlay size={16} />
                {t("open_wallboard")}
              </button>
            ) : null}
            <div className="user-chip">
              <strong>{user.name}</strong>
              <span>{t(roleLabelKey(user.role))}</span>
            </div>
            <button className="outline-button icon-button topbar-logout" type="button" onClick={logout}>
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="portal-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
