import type { LocaleKey } from "../contexts/localeTypes";
import type { AchievementType, EventType, Role } from "../types/portal";

export const roleLabelKey = (role: Role): LocaleKey => {
  if (role === "student") return "k_001";
  if (role === "teacher") return "k_002";
  if (role === "parent") return "k_003";
  return "k_004";
};

export const eventTypeLabelKey = (type: EventType): LocaleKey => {
  if (type === "news") return "k_005";
  if (type === "event") return "k_006";
  return "k_007";
};

export const achievementTypeLabelKey = (type: AchievementType): LocaleKey => {
  if (type === "academic") return "k_008";
  if (type === "sport") return "k_009";
  if (type === "creative") return "k_010";
  return "k_011";
};

