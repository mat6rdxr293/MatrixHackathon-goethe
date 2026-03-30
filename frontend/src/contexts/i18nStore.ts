import { createContext } from "react";
import type { Lang } from "../types/portal";
import type { LocaleKey } from "./localeTypes";

export type I18nContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: LocaleKey) => string;
};

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

