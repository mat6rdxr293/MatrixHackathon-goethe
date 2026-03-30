import type { Lang } from "../types/portal";

export const formatDate = (date: string, lang: Lang) => {
  const locale = lang === "ru" ? "ru-RU" : "kk-KZ";
  return new Date(date).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

