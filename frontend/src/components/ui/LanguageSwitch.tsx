import { Languages } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();

  return (
    <div className="lang-switch" aria-label={t("k_238")}>
      <Languages size={14} />
      <button
        className={lang === "ru" ? "lang-btn active" : "lang-btn"}
        type="button"
        onClick={() => setLang("ru")}
      >
        RU
      </button>
      <button
        className={lang === "kk" ? "lang-btn active" : "lang-btn"}
        type="button"
        onClick={() => setLang("kk")}
      >
        KZ
      </button>
    </div>
  );
}
