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
      ? t("aggregation_by_classes")
      : explainability.source === "school-aggregates"
        ? t("aggregation_by_school")
        : t("profile_student_2")
    : "";

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={dashboard.loading} error={dashboard.error} onRetry={dashboard.refresh} />

        {dashboard.data?.role === "student" ? (
          <>
            <div className="dashboard-focus-border">
              <h4 className="dashboard-focus-title">{t("average_score")}</h4>
              <div className="stats-grid">
                <StatCard title={t("average_score")} value={dashboard.data.averageScore.toFixed(1)} caption={t("by_all_subjects")} icon={GraduationCap} />
                <StatCard
                  title={t("change_for_period")}
                  value={dashboard.data.periodDelta > 0 ? `+${dashboard.data.periodDelta}` : dashboard.data.periodDelta}
                  tone={dashboard.data.periodDelta < 0 ? "warn" : "good"}
                  icon={TrendingUp}
                />
                <StatCard title={t("weak_subjects")} value={dashboard.data.weakSubjects.length} tone="warn" icon={AlertTriangle} />
              </div>
            </div>

            <div className="dashboard-focus-border">
              <h4 className="dashboard-focus-title">{t("zones_attention")}</h4>
              <Section title={t("zones_attention")}>
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
              <h4 className="dashboard-focus-title">{t("performance")}</h4>
              <Section title={t("performance")}>
                <MetricBarChart data={studentHistory} valueLabel={t("score")} />
              </Section>
            </div>

            <Section title={t("achievements")}>
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

            <Section title={t("advice_ai")}>
              {mentorState.loading ? <p className="thinking-text">{t("thinking_text")}</p> : <p>{studentAiText}</p>}
              <div className="action-row">
                <button className="outline-button icon-button" type="button" onClick={() => navigate("/app/progress")}>
                  <BookOpenCheck size={16} />
                  {t("open_progress")}
                </button>
                <button className="outline-button icon-button" type="button" onClick={() => navigate("/app/ai-mentor")}>
                  <Sparkles size={16} />
                  {t("review_ai")}
                </button>
              </div>
            </Section>

            {explainability && !mentorState.loading ? (
              <Section title={t("why_ai_this_thinks")}>
                <div className="stats-grid">
                  <StatCard title={t("confidence_model")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("source_2")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
                </div>
                <h4>{t("factors")}</h4>
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
              <StatCard title={t("my_classes")} value={dashboard.data.classes.length} icon={GraduationCap} />
              <StatCard title={t("students_in_risk")} value={dashboard.data.riskStudents.length} tone="warn" icon={AlertTriangle} />
              <StatCard title={t("achievements_students")} value={dashboard.data.studentAchievements.length} icon={Trophy} />
            </div>

            {dashboard.data.teacherEfficiency ? (
              <Section title={t("saving_time_teachers")}>
                <div className="stats-grid">
                  <StatCard
                    title={t("saved_for_week")}
                    value={dashboard.data.teacherEfficiency.weeklyHoursSaved}
                    caption={t("auto_hours")}
                    icon={Sparkles}
                  />
                  <StatCard
                    title={t("auto_actions")}
                    value={dashboard.data.teacherEfficiency.automatedActions}
                    caption={t("completed")}
                    icon={BookOpenCheck}
                  />
                  <StatCard
                    title={t("recommended")}
                    value={dashboard.data.teacherEfficiency.recommendedActions}
                    caption={t("points_attention")}
                    tone="warn"
                    icon={AlertTriangle}
                  />
                </div>
                <div className="chip-row">
                  <span className="chip">{t("focus_classes")}:</span>
                  {dashboard.data.teacherEfficiency.focusClasses.length > 0 ? (
                    dashboard.data.teacherEfficiency.focusClasses.map((classId) => (
                      <span key={classId} className="chip warn">
                        {classId}
                      </span>
                    ))
                  ) : (
                    <span className="chip">{t("none_data")}</span>
                  )}
                </div>
              </Section>
            ) : null}

            <Section title={t("performance_by_classes")}>
              <MetricBarChart
                data={dashboard.data.averageByClass.map((item) => ({ label: item.classId, value: item.averageScore }))}
                valueLabel={t("score")}
              />
            </Section>

            <Section title={t("performance_by_classes")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("class")}</th>
                    <th>{t("risk_students")}</th>
                    <th>{t("score")}</th>
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

            <Section title={t("hint_ai_by_class")}>
              {mentorState.loading ? <p className="thinking-text">{t("thinking_text")}</p> : <p>{teacherAiText}</p>}
            </Section>

            {explainability && !mentorState.loading ? (
              <Section title={t("why_ai_this_thinks")}>
                <div className="stats-grid">
                  <StatCard title={t("confidence_model")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("source_2")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
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
              <StatCard title={t("child")} value={dashboard.data.child} icon={GraduationCap} />
              <StatCard title={t("current_average_score")} value={dashboard.data.averageScore.toFixed(1)} icon={TrendingUp} />
              <StatCard title={t("events_school")} value={dashboard.data.events.length} icon={CalendarDays} />
            </div>

            <Section title={t("trend_by_subjects")}>
              <TrendBarChart
                data={dashboard.data.dynamicTrend.map((item) => ({ label: item.subject, value: item.trend }))}
                valueLabel={t("change")}
              />
            </Section>

            <Section title={t("trend_by_subjects")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("subject")}</th>
                    <th>{t("current_score")}</th>
                    <th>{t("trend")}</th>
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

            <Section title={t("comment_ai")}>
              {mentorState.loading ? <p className="thinking-text">{t("thinking_text")}</p> : <p>{parentAiText}</p>}
            </Section>

            {dashboard.data.weeklySummary ? (
              <Section title={t("summary_week")}>
                <div className="stats-grid">
                  <StatCard
                    title={dashboard.data.weeklySummary.delta >= 0 ? t("growth") : t("drop")}
                    value={`${dashboard.data.weeklySummary.delta > 0 ? "+" : ""}${dashboard.data.weeklySummary.delta}`}
                    caption={t("for_week")}
                    tone={dashboard.data.weeklySummary.delta >= 0 ? "good" : "warn"}
                    icon={TrendingUp}
                  />
                  <StatCard title={t("strong_signals_week")} value={dashboard.data.weeklySummary.wins.length} icon={Trophy} />
                  <StatCard title={t("risks_week")} value={dashboard.data.weeklySummary.risks.length} tone="warn" icon={AlertTriangle} />
                </div>
                <div className="list-grid">
                  <article className="mini-card">
                    <h4>{t("strong_signals_week")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.wins.length > 0
                        ? dashboard.data.weeklySummary.wins
                        : [t("none_data")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="mini-card">
                    <h4>{t("risks_week")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.risks.length > 0
                        ? dashboard.data.weeklySummary.risks
                        : [t("none_data")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="mini-card">
                    <h4>{t("plan_for_next_week")}</h4>
                    <ul className="plain-list">
                      {(dashboard.data.weeklySummary.plan.length > 0
                        ? dashboard.data.weeklySummary.plan
                        : [t("none_data")]).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                </div>
              </Section>
            ) : null}

            {explainability && !mentorState.loading ? (
              <Section title={t("why_ai_this_thinks")}>
                <div className="stats-grid">
                  <StatCard title={t("confidence_model")} value={`${explainability.confidence}%`} icon={BarChart3} />
                  <StatCard title={t("source_2")} value={explainabilitySourceLabel} icon={BookOpenCheck} />
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
              <StatCard title={t("average_score_school")} value={dashboard.data.schoolAverage.toFixed(2)} icon={BarChart3} />
              <StatCard title={t("events")} value={dashboard.data.totalEvents} icon={CalendarDays} />
              <StatCard title={t("new_achievements")} value={dashboard.data.newAchievements} icon={Trophy} />
            </div>

            <Section title={t("overview_school_2")}>
              <MetricBarChart
                data={[
                  ...dashboard.data.topClasses.map((item) => ({ label: item, value: 1, tone: "good" as const })),
                  ...dashboard.data.riskyClasses.map((item) => ({ label: item, value: 1, tone: "warn" as const })),
                ]}
                valueLabel={t("class")}
              />
            </Section>

            <div className="dual-grid">
              <Section title={t("best_classes")}>
                <div className="chip-row">
                  {dashboard.data.topClasses.map((item) => (
                    <span key={item} className="chip good">
                      {item}
                    </span>
                  ))}
                </div>
              </Section>
              <Section title={t("quick_actions")}>
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

