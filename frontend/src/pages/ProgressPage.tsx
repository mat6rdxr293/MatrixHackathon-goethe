import { useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { trendTone } from "../lib/api";
import type { ProgressResponse } from "../types/portal";
import { MetricBarChart, StudentHistoryChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

export function ProgressPage() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useApiData<ProgressResponse>("/api/progress");
  const [subjectFilter, setSubjectFilter] = useState<"all" | "risk">("all");
  const [period, setPeriod] = useState(t("k_246"));

  const activePeriod =
    data && "periodSwitch" in data && data.periodSwitch.length > 0
      ? data.periodSwitch.includes(period)
        ? period
        : data.periodSwitch[0]
      : period;

  const studentSubjects =
    data && "student" in data && data.student
      ? data.student.progress.filter((item) => (subjectFilter === "risk" ? item.risk : true))
      : [];

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data && "student" in data && data.student ? (
          <>
            <div className="filter-row">
              <div className="chip-group">
                <button
                  className={subjectFilter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setSubjectFilter("all")}
                >
                  {t("k_099")}
                </button>
                <button
                  className={subjectFilter === "risk" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setSubjectFilter("risk")}
                >
                  {t("k_100")}
                </button>
              </div>
              <div className="chip-group">
                {data.periodSwitch.map((item) => (
                  <button
                    key={item}
                    className={activePeriod === item ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setPeriod(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <Section title={t("k_029")}>
              <StudentHistoryChart progress={studentSubjects} scoreLabel={t("k_102")} />
            </Section>

            <Section title={t("k_099")}>
              <MetricBarChart
                data={studentSubjects.map((subject) => ({
                  label: subject.subject,
                  value: subject.current,
                  tone: subject.risk ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("k_102")}
              />
            </Section>

            <Section title={t("k_101")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_090")}</th>
                    <th>{t("k_102")}</th>
                    <th>{t("k_092")}</th>
                    <th>{t("k_103")}</th>
                  </tr>
                </thead>
                <tbody>
                  {studentSubjects.map((subject) => (
                    <tr key={subject.subject}>
                      <td>{subject.subject}</td>
                      <td>{subject.current.toFixed(1)}</td>
                      <td className={`trend ${trendTone(subject.trend)}`}>
                        {subject.trend > 0 ? "+" : ""}
                        {subject.trend}
                      </td>
                      <td>
                        {subject.risk ? (
                          <span className="chip warn">{t("k_104")}</span>
                        ) : (
                          <span className="chip good">{t("k_105")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        ) : null}

        {data && "classes" in data ? (
          <>
            <Section title={t("k_106")}>
              <MetricBarChart
                data={data.classes.map((item) => ({
                  label: item.classId,
                  value: item.averageScore,
                  tone: item.riskStudents.length > 0 ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("k_102")}
              />
            </Section>

            <Section title={t("k_106")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_083")}</th>
                    <th>{t("k_102")}</th>
                    <th>{t("k_107")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.classes.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>{item.averageScore.toFixed(1)}</td>
                      <td>{item.riskStudents.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        ) : null}

        {data && "byClass" in data ? (
          <>
            <Section title={t("k_108")}>
              <MetricBarChart
                data={data.byClass.map((item) => ({
                  label: item.classId,
                  value: item.avgScore,
                  tone: item.riskStudents.length > 0 ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("k_102")}
              />
            </Section>

            <Section title={t("k_108")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("k_083")}</th>
                    <th>{t("k_002")}</th>
                    <th>{t("k_102")}</th>
                    <th>{t("k_084")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClass.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>{item.teacherId}</td>
                      <td>{item.avgScore.toFixed(1)}</td>
                      <td>{item.riskStudents.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}


