import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { convertQuickLink, trendTone } from "../lib/api";
import { formatDate } from "../lib/format";
import type { AiMentorResponse, DashboardResponse, ProgressResponse } from "../types/portal";
import { MetricBarChart, TrendBarChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { StatCard } from "../components/ui/StatCard";

export function DashboardPage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const dashboard = useApiData<DashboardResponse>("/api/dashboard");
  const progress = useApiData<ProgressResponse>("/api/progress");
  const mentorState = useApiData<AiMentorResponse>(user?.role === "admin" ? null : "/api/ai-mentor");

  const studentHistory =
    progress.data && "student" in progress.data && progress.data.student
      ? progress.data.student.progress.map((subject) => ({
          label: subject.subject,
          value: subject.current,
          tone: subject.risk ? ("warn" as const) : undefined,
        }))
      : [];

  const studentAiText =
    mentorState.data?.recommendations?.[0] ??
    mentorState.data?.summary ??
    (dashboard.data?.role === "student" ? dashboard.data.aiRecommendation : "");

  const teacherAiText =
    mentorState.data?.summary ?? (dashboard.data?.role === "teacher" ? dashboard.data.aiSummary : "");

  const parentAiText =
    mentorState.data?.summary ?? (dashboard.data?.role === "parent" ? dashboard.data.aiSummary : "");

  const explainability = mentorState.data?.explainability;
  const explainabilitySourceLabel = explainability
    ? explainability.source === "class-aggregates"
      ? t("k_335")
      : explainability.source === "school-aggregates"
        ? t("k_336")
        : t("k_334")
    : "";

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={dashboard.loading} error={dashboard.error} onRetry={dashboard.refresh} />

        {dashboard.data?.role === "student" ? (
          <>
            <div className="dashboard-focus-border">
              <h4 className="dashboard-focus-title">{t("k_071")}</h4>
              <div className="stats-grid">
                <StatCard title={t("k_071")} value={dashboard.data.averageScore.toFixed(1)} caption={t("k_072")} icon={GraduationCap} />
                <StatCard
                  title={t("k_073")}
                  value={dashboard.data.periodDelta > 0 ? `+${dashboard.data.periodDelta}` : dashboard.data.periodDelta}
                  tone={dashboard.data.periodDelta < 0 ? "warn" : "good"}
                  icon={TrendingUp}
                />
                <StatCard title={t("k_074")} value={dashboard.data.weakSubjects.length} tone="warn" icon={AlertTriangle} />
              </div>
            </div>

            <div className="dashboard-focus-border">
              <h4 className="dashboard-focus-title">{t("k_075")}</h4>
              <Section title={t("k_075")}>
                <div className="chip-row">
                  {dashboard.data.weakSubjects.map((subject) => (
                    <span key={subject} className="chip warn">
                      {subject}
                    </span>
                  ))}
                </div>
              </Section>
            </div>

            <div className="dashboard-focus-border">
              <h4 className="dashboard-focus-title">{t("k_029")}</h4>
              <Section title={t("k_029")}>
                <MetricBarChart data={studentHistory} valueLabel={t("k_102")} />
              </Section>
            </div>

            <Section title={t("k_014")}>
              <div className="list-grid">
                {dashboard.data.achievements.map((item) => (
                  <article key={item.id} className="mini-card">
                    <h4>{item.title}</h4>
                    <p>{item.badge}</p>
                    <div className="mini-meta">
                      <span>{formatDate(item.date, lang)}</span>
                      <strong>{item.points}</strong>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            <Section title={t("k_076")}>
              {mentorState.loading ? <p className="thinking-text">{t("k_240")}</p> : <p>{studentAiText}</p>}
              <div className="action-row">
                <button className="outline-button icon-button" type="button" onClick={() => navigate("/app/progress")}>
                  <BookOpenCheck size={16} />
                  {t("k_077")}
                </button>
                <button className="outline-button icon-button" type="button" onClick={() => navigate("/app/ai-mentor")}>
                  <Sparkles size={16} />
                  {t("k_078")}
                </button>
              </div>
            </Section>

            {explainability && !mentorState.loading ? (
              <Section title={t("k_313")}>
                <div className="stats-grid">
                  <StatCard title={t("k_314")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("k_316")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
                </div>
                <h4>{t("k_315")}</h4>
                <ul className="plain-list">
                  {explainability.drivers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : null}

        {dashboard.data?.role === "teacher" ? (
          <>
            <div className="stats-grid">
              <StatCard title={t("k_079")} value={dashboard.data.classes.length} icon={GraduationCap} />
              <StatCard title={t("k_080")} value={dashboard.data.riskStudents.length} tone="warn" icon={AlertTriangle} />
              <StatCard title={t("k_081")} value={dashboard.data.studentAchievements.length} icon={Trophy} />
            </div>

            {dashboard.data.teacherEfficiency ? (
              <Section title={t("k_307")}>
                <div className="stats-grid">
                  <StatCard
                    title={t("k_308")}
                    value={dashboard.data.teacherEfficiency.weeklyHoursSaved}
                    caption={t("k_309")}
                    icon={Sparkles}
                  />
                  <StatCard
                    title={t("k_310")}
                    value={dashboard.data.teacherEfficiency.automatedActions}
                    caption={t("k_311")}
                    icon={BookOpenCheck}
                  />
                  <StatCard
                    title={t("k_337")}
                    value={dashboard.data.teacherEfficiency.recommendedActions}
                    caption={t("k_338")}
                    tone="warn"
                    icon={AlertTriangle}
                  />
                </div>
                <div className="chip-row">
                  <span className="chip">{t("k_312")}:</span>
                  {dashboard.data.teacherEfficiency.focusClasses.length > 0 ? (
                    dashboard.data.teacherEfficiency.focusClasses.map((classId) => (
                      <span key={classId} className="chip warn">
                        {classId}
                      </span>
                    ))
                  ) : (
                    <span className="chip">{t("k_340")}</span>
                  )}
                </div>
              </Section>
            ) : null}

            <Section title={t("k_082")}>
              <MetricBarChart
                data={dashboard.data.averageByClass.map((item) => ({ label: item.classId, value: item.averageScore }))}
                valueLabel={t("k_102")}
              />
            </Section>

            <Section title={t("k_082")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_083")}</th>
                    <th>{t("k_084")}</th>
                    <th>{t("k_102")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data.classes.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>{item.riskStudents.length}</td>
                      <td>{item.averageScore.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title={t("k_085")}>
              {mentorState.loading ? <p className="thinking-text">{t("k_240")}</p> : <p>{teacherAiText}</p>}
            </Section>

            {explainability && !mentorState.loading ? (
              <Section title={t("k_313")}>
                <div className="stats-grid">
                  <StatCard title={t("k_314")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("k_316")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
                </div>
                <ul className="plain-list">
                  {explainability.drivers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : null}

        {dashboard.data?.role === "parent" ? (
          <>
            <div className="stats-grid">
              <StatCard title={t("k_086")} value={dashboard.data.child} icon={GraduationCap} />
              <StatCard title={t("k_087")} value={dashboard.data.averageScore.toFixed(1)} icon={TrendingUp} />
              <StatCard title={t("k_088")} value={dashboard.data.events.length} icon={CalendarDays} />
            </div>

            <Section title={t("k_089")}>
              <TrendBarChart
                data={dashboard.data.dynamicTrend.map((item) => ({ label: item.subject, value: item.trend }))}
                valueLabel={t("k_123")}
              />
            </Section>

            <Section title={t("k_089")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_090")}</th>
                    <th>{t("k_091")}</th>
                    <th>{t("k_092")}</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.data.dynamicTrend.map((item) => (
                    <tr key={item.subject}>
                      <td>{item.subject}</td>
                      <td>{item.current.toFixed(1)}</td>
                      <td className={`trend ${trendTone(item.trend)}`}>
                        {item.trend > 0 ? "+" : ""}
                        {item.trend}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title={t("k_093")}>
              {mentorState.loading ? <p className="thinking-text">{t("k_240")}</p> : <p>{parentAiText}</p>}
            </Section>

            {dashboard.data.weeklySummary ? (
              <Section title={t("k_317")}>
                <div className="stats-grid">
                  <StatCard
                    title={dashboard.data.weeklySummary.delta >= 0 ? t("k_321") : t("k_322")}
                    value={`${dashboard.data.weeklySummary.delta > 0 ? "+" : ""}${dashboard.data.weeklySummary.delta}`}
                    caption={t("k_339")}
                    tone={dashboard.data.weeklySummary.delta >= 0 ? "good" : "warn"}
                    icon={TrendingUp}
                  />
                  <StatCard title={t("k_318")} value={dashboard.data.weeklySummary.wins.length} icon={Trophy} />
                  <StatCard title={t("k_319")} value={dashboard.data.weeklySummary.risks.length} tone="warn" icon={AlertTriangle} />
                </div>
                <div className="list-grid">
                  <article className="mini-card">
                    <h4>{t("k_318")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.wins.length > 0
                        ? dashboard.data.weeklySummary.wins
                        : [t("k_340")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="mini-card">
                    <h4>{t("k_319")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.risks.length > 0
                        ? dashboard.data.weeklySummary.risks
                        : [t("k_340")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="mini-card">
                    <h4>{t("k_320")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.plan.length > 0
                        ? dashboard.data.weeklySummary.plan
                        : [t("k_340")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </Section>
            ) : null}

            {explainability && !mentorState.loading ? (
              <Section title={t("k_313")}>
                <div className="stats-grid">
                  <StatCard title={t("k_314")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("k_316")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
                </div>
                <ul className="plain-list">
                  {explainability.drivers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </>
        ) : null}

        {dashboard.data?.role === "admin" ? (
          <>
            <div className="stats-grid">
              <StatCard title={t("k_094")} value={dashboard.data.schoolAverage.toFixed(2)} icon={BarChart3} />
              <StatCard title={t("k_015")} value={dashboard.data.totalEvents} icon={CalendarDays} />
              <StatCard title={t("k_095")} value={dashboard.data.newAchievements} icon={Trophy} />
            </div>

            <Section title={t("k_031")}>
              <MetricBarChart
                data={[
                  ...dashboard.data.topClasses.map((item) => ({ label: item, value: 1, tone: "good" as const })),
                  ...dashboard.data.riskyClasses.map((item) => ({ label: item, value: 1, tone: "warn" as const })),
                ]}
                valueLabel={t("k_083")}
              />
            </Section>

            <div className="dual-grid">
              <Section title={t("k_096")}>
                <div className="chip-row">
                  {dashboard.data.topClasses.map((item) => (
                    <span key={item} className="chip good">
                      {item}
                    </span>
                  ))}
                </div>
              </Section>
              <Section title={t("k_098")}>
                <div className="action-row">
                  {dashboard.data.quickLinks.map((item) => (
                    <button
                      key={item.id}
                      className="outline-button icon-button"
                      type="button"
                      onClick={() => navigate(convertQuickLink(item.href))}
                    >
                      <Sparkles size={16} />
                      {item.title}
                    </button>
                  ))}
                </div>
              </Section>
            </div>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}

