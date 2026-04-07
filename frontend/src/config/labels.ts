import type { LocaleKey } from "../contexts/localeTypes";
import type { AchievementType, EventType, Role } from "../types/portal";

export const roleLabelKey = (role: Role): LocaleKey => {
  if (role === "student") return "student";
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  return "administration";
};

export const eventTypeLabelKey = (type: EventType): LocaleKey => {
  if (type === "news") return "news";
  if (type === "event") return "event";
  return "announcement";
};

export const achievementTypeLabelKey = (type: AchievementType): LocaleKey => {
  if (type === "academic") return "study";
  if (type === "sport") return "sport";
  if (type === "creative") return "creative";
  return "social";
};

