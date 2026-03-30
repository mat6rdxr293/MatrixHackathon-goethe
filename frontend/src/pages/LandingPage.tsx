import {
  Brain,
  CalendarDays,
  ChartColumnIncreasing,
  GraduationCap,
  School,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "../hooks/useI18n";
import { LanguageSwitch } from "../components/ui/LanguageSwitch";
import { StatCard } from "../components/ui/StatCard";
import { PageTransition } from "../components/ui/PageTransition";

export function LandingPage() {
  const { t } = useI18n();

  return (
    <PageTransition>
      <div className="landing-page">
        <header className="landing-header">
          <div className="landing-nav">
            <div className="logo-tag">
              <School size={14} />
              Aqbobek Lyceum
            </div>
            <LanguageSwitch />
          </div>

          <div className="hero-grid">
            <div>
              <p className="hero-kicker">{t("k_043")}</p>
              <h1>{t("k_160")}</h1>
              <p>{t("k_161")}</p>
              <div className="hero-actions">
                <Link className="solid-button" to="/login">
                  {t("k_044")}
                </Link>
                <a className="outline-button link-button" href="#features">
                  {t("k_045")}
                </a>
              </div>
            </div>

            <div className="hero-metrics">
              <StatCard title={t("k_046")} value="4" caption={t("k_047")} icon={ChartColumnIncreasing} />
              <StatCard title={t("k_048")} value="3" caption={t("k_239")} icon={Brain} />
              <StatCard title={t("k_049")} value={t("k_050")} caption={t("k_051")} icon={CalendarDays} />
            </div>
          </div>
        </header>

        <section id="features" className="landing-section">
          <h2>{t("k_052")}</h2>
          <div className="feature-grid">
            <article className="feature-card">
              <h3>
                <ChartColumnIncreasing size={17} />
                {t("k_053")}
              </h3>
              <p>{t("k_054")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <Trophy size={17} />
                {t("k_055")}
              </h3>
              <p>{t("k_056")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <CalendarDays size={17} />
                {t("k_057")}
              </h3>
              <p>{t("k_058")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <Brain size={17} />
                {t("k_059")}
              </h3>
              <p>{t("k_162")}</p>
            </article>
          </div>
        </section>

        <section className="landing-section">
          <h2>{t("k_060")}</h2>
          <div className="roles-grid">
            <article className="role-card">
              <h3>
                <GraduationCap size={17} />
                {t("k_001")}
              </h3>
              <p>{t("k_061")}</p>
            </article>
            <article className="role-card">
              <h3>
                <UserRound size={17} />
                {t("k_002")}
              </h3>
              <p>{t("k_062")}</p>
            </article>
            <article className="role-card">
              <h3>
                <UsersRound size={17} />
                {t("k_003")}
              </h3>
              <p>{t("k_063")}</p>
            </article>
            <article className="role-card">
              <h3>
                <ShieldCheck size={17} />
                {t("k_004")}
              </h3>
              <p>{t("k_064")}</p>
            </article>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
