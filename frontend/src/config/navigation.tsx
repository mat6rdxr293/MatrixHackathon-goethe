import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  MonitorPlay,
  Settings,
  Sparkles,
  Trophy,
  User,
  Users,
} from "lucide-react";
import type { LocaleKey } from "../contexts/localeTypes";
import type { Role } from "../types/portal";

export type NavItem = {
  to: string;
  labelKey: LocaleKey;
  icon: LucideIcon;
};

const studentMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "k_012", icon: LayoutDashboard },
  { to: "/app/progress", labelKey: "k_013", icon: BookOpen },
  { to: "/app/schedule", labelKey: "k_205", icon: CalendarClock },
  { to: "/app/achievements", labelKey: "k_014", icon: Trophy },
  { to: "/app/events", labelKey: "k_015", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "k_211", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "k_016", icon: Sparkles },
  { to: "/app/profile", labelKey: "k_017", icon: User },
];

const teacherMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "k_012", icon: LayoutDashboard },
  { to: "/app/classes", labelKey: "k_018", icon: GraduationCap },
  { to: "/app/schedule", labelKey: "k_205", icon: CalendarClock },
  { to: "/app/progress", labelKey: "k_019", icon: BookOpen },
  { to: "/app/achievements", labelKey: "k_014", icon: Trophy },
  { to: "/app/events", labelKey: "k_015", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "k_211", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "k_020", icon: Sparkles },
  { to: "/app/profile", labelKey: "k_017", icon: User },
];

const parentMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "k_012", icon: LayoutDashboard },
  { to: "/app/schedule", labelKey: "k_205", icon: CalendarClock },
  { to: "/app/progress", labelKey: "k_021", icon: BookOpen },
  { to: "/app/achievements", labelKey: "k_014", icon: Trophy },
  { to: "/app/events", labelKey: "k_015", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "k_211", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "k_022", icon: Sparkles },
  { to: "/app/profile", labelKey: "k_017", icon: User },
];

const adminMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "k_012", icon: LayoutDashboard },
  { to: "/app/admin/analytics", labelKey: "k_023", icon: BarChart3 },
  { to: "/app/schedule", labelKey: "k_205", icon: CalendarClock },
  { to: "/app/admin/schedule", labelKey: "k_213", icon: CalendarClock },
  { to: "/app/classes", labelKey: "k_018", icon: GraduationCap },
  { to: "/app/events", labelKey: "k_024", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "k_211", icon: Bell },
  { to: "/app/achievements", labelKey: "k_014", icon: Trophy },
  { to: "/app/admin/users", labelKey: "k_025", icon: Users },
  { to: "/app/admin/content", labelKey: "k_026", icon: BookOpen },
  { to: "/kiosk", labelKey: "k_027", icon: MonitorPlay },
  { to: "/app/profile", labelKey: "k_028", icon: Settings },
];

export const menuByRole = (role: Role) => {
  if (role === "student") {
    return studentMenu;
  }
  if (role === "teacher") {
    return teacherMenu;
  }
  if (role === "parent") {
    return parentMenu;
  }
  return adminMenu;
};

export const pageTitleByPath = (pathname: string): LocaleKey => {
  if (pathname.startsWith("/app/dashboard")) return "k_012";
  if (pathname.startsWith("/app/schedule")) return "k_205";
  if (pathname.startsWith("/app/notifications")) return "k_211";
  if (pathname.startsWith("/app/admin/schedule")) return "k_213";
  if (pathname.startsWith("/app/classes")) return "k_018";
  if (pathname.startsWith("/app/progress")) return "k_029";
  if (pathname.startsWith("/app/achievements")) return "k_014";
  if (pathname.startsWith("/app/events")) return "k_030";
  if (pathname.startsWith("/app/ai-mentor")) return "k_016";
  if (pathname.startsWith("/app/admin/analytics")) return "k_031";
  if (pathname.startsWith("/app/admin/users")) return "k_032";
  if (pathname.startsWith("/app/admin/content")) return "k_033";
  if (pathname.startsWith("/app/students/")) return "k_017";
  if (pathname.startsWith("/app/profile")) return "k_017";
  return "k_034";
};

