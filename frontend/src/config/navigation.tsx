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
  FlaskConical,
} from "lucide-react";
import type { LocaleKey } from "../contexts/localeTypes";
import type { Role } from "../types/portal";

export type NavItem = {
  to: string;
  labelKey: LocaleKey;
  icon: LucideIcon;
};

const studentMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "home", icon: LayoutDashboard },
  { to: "/app/subjects", labelKey: "subjects_practice", icon: FlaskConical },
  { to: "/app/progress", labelKey: "my_progress", icon: BookOpen },
  { to: "/app/schedule", labelKey: "schedule", icon: CalendarClock },
  { to: "/app/achievements", labelKey: "achievements", icon: Trophy },
  { to: "/app/events", labelKey: "events", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "notifications", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "ai_assistant", icon: Sparkles },
  { to: "/app/profile", labelKey: "profile", icon: User },
];

const teacherMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "home", icon: LayoutDashboard },
  { to: "/app/subjects", labelKey: "subjects_practice", icon: FlaskConical },
  { to: "/app/classes", labelKey: "classes", icon: GraduationCap },
  { to: "/app/schedule", labelKey: "schedule", icon: CalendarClock },
  { to: "/app/progress", labelKey: "progress_students", icon: BookOpen },
  { to: "/app/achievements", labelKey: "achievements", icon: Trophy },
  { to: "/app/events", labelKey: "events", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "notifications", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "help_ai", icon: Sparkles },
  { to: "/app/profile", labelKey: "profile", icon: User },
];

const parentMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "home", icon: LayoutDashboard },
  { to: "/app/schedule", labelKey: "schedule", icon: CalendarClock },
  { to: "/app/progress", labelKey: "progress_child", icon: BookOpen },
  { to: "/app/achievements", labelKey: "achievements", icon: Trophy },
  { to: "/app/events", labelKey: "events", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "notifications", icon: Bell },
  { to: "/app/ai-mentor", labelKey: "tips_ai", icon: Sparkles },
  { to: "/app/profile", labelKey: "profile", icon: User },
];

const adminMenu: NavItem[] = [
  { to: "/app/dashboard", labelKey: "home", icon: LayoutDashboard },
  { to: "/app/admin/analytics", labelKey: "overview_school", icon: BarChart3 },
  { to: "/app/schedule", labelKey: "schedule", icon: CalendarClock },
  { to: "/app/admin/schedule", labelKey: "smart_schedule", icon: CalendarClock },
  { to: "/app/classes", labelKey: "classes", icon: GraduationCap },
  { to: "/app/events", labelKey: "news_and_events", icon: CalendarDays },
  { to: "/app/notifications", labelKey: "notifications", icon: Bell },
  { to: "/app/achievements", labelKey: "achievements", icon: Trophy },
  { to: "/app/admin/users", labelKey: "users", icon: Users },
  { to: "/app/admin/content", labelKey: "content", icon: BookOpen },
  { to: "/kiosk", labelKey: "mode_wallboard", icon: MonitorPlay },
  { to: "/app/profile", labelKey: "settings", icon: Settings },
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
  if (pathname.startsWith("/app/dashboard")) return "home";
  if (pathname.startsWith("/app/schedule")) return "schedule";
  if (pathname.startsWith("/app/notifications")) return "notifications";
  if (pathname.startsWith("/app/admin/schedule")) return "smart_schedule";
  if (pathname.startsWith("/app/classes")) return "classes";
  if (pathname.startsWith("/app/progress")) return "performance";
  if (pathname.startsWith("/app/achievements")) return "achievements";
  if (pathname.startsWith("/app/events")) return "events_and_news";
  if (pathname.startsWith("/app/ai-mentor")) return "ai_assistant";
  if (pathname.startsWith("/app/admin/analytics")) return "overview_school_2";
  if (pathname.startsWith("/app/admin/users")) return "users_and_roles";
  if (pathname.startsWith("/app/admin/content")) return "management_content";
  if (pathname.startsWith("/app/subjects/")) return "subject_practice_title";
  if (pathname.startsWith("/app/subjects")) return "subjects_hub_title";
  if (pathname.startsWith("/app/students/")) return "profile";
  if (pathname.startsWith("/app/profile")) return "profile";
  return "portal";
};

