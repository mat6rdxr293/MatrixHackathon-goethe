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
              Matrix Education
            </div>
            <LanguageSwitch />
          </div>

          <div className="hero-grid">
            <div>
              <p className="hero-kicker">{t("school_digital_environment")}</p>
              <h1>{t("portal_where_student_teacher_parent_and_administration_view")}</h1>
              <p>{t("grades_successes_events_assistant_ai_and_wallboard_in_single")}</p>
              <div className="hero-actions">
                <Link className="solid-button" to="/login">
                  {t("login_to_portal")}
                </Link>
                <a className="outline-button link-button" href="#features">
                  {t("view_features")}
                </a>
              </div>
            </div>

            <div className="hero-metrics">
              <StatCard title={t("roles_in_system")} value="4" caption={t("student_teacher_parent_admin")} icon={ChartColumnIncreasing} />
              <StatCard title={t("main_features")} value="3" caption={t("bilimclass_plus_assistant_ai_plus_wallboard")} icon={Brain} />
              <StatCard title={t("single_environment")} value={t("yes")} caption={t("single_login_for_all_roles")} icon={CalendarDays} />
            </div>
          </div>
        </header>

        <section id="features" className="landing-section">
          <h2>{t("key_modules")}</h2>
          <div className="feature-grid">
            <article className="feature-card">
              <h3>
                <ChartColumnIncreasing size={17} />
                {t("study_panel")}
              </h3>
              <p>{t("average_score_trend_zones_risk")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <Trophy size={17} />
                {t("successes")}
              </h3>
              <p>{t("badges_wins_rating_students")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <CalendarDays size={17} />
                {t("news_and_events_2")}
              </h3>
              <p>{t("news_events_and_important_announcements")}</p>
            </article>
            <article className="feature-card">
              <h3>
                <Brain size={17} />
                {t("assistant_ai")}
              </h3>
              <p>{t("analysis_progress_and_personal_recommendations")}</p>
            </article>
          </div>
        </section>

        <section className="landing-section">
          <h2>{t("roles_users")}</h2>
          <div className="roles-grid">
            <article className="role-card">
              <h3>
                <GraduationCap size={17} />
                {t("student")}
              </h3>
              <p>{t("personal_progress_goals_and_tips_ai")}</p>
            </article>
            <article className="role-card">
              <h3>
                <UserRound size={17} />
                {t("teacher")}
              </h3>
              <p>{t("classes_at_risk_students_summary")}</p>
            </article>
            <article className="role-card">
              <h3>
                <UsersRound size={17} />
                {t("parent")}
              </h3>
              <p>{t("trend_child_and_recommendations")}</p>
            </article>
            <article className="role-card">
              <h3>
                <ShieldCheck size={17} />
                {t("administration")}
              </h3>
              <p>{t("overview_school_and_management_news")}</p>
            </article>
          </div>
        </section>
      </div>
    </PageTransition>
  );
}
