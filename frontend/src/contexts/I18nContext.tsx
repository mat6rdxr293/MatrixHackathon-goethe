import { useCallback, useMemo, useState } from "react";
import ruLocale from "../locales/ru.json";
import kkLocale from "../locales/kk.json";
import { STORAGE_KEYS } from "../config/constants";
import { I18nContext } from "./i18nStore";
import type { LocaleKey } from "./localeTypes";
import type { Lang } from "../types/portal";

const locales = {
  ru: ruLocale,
  kk: kkLocale,
} as const;

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.lang);
    return saved === "kk" ? "kk" : "ru";
  });

  const setLang = (value: Lang) => {
    localStorage.setItem(STORAGE_KEYS.lang, value);
    setLangState(value);
  };

  const t = useCallback(
    (key: LocaleKey) => {
      return locales[lang][key] ?? locales.ru[key] ?? key;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

