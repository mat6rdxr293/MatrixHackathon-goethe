import { AlertTriangle, BarChart3, CalendarDays, Trophy, Users } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import type { AdminAnalyticsResponse } from "../types/portal";
import { MetricBarChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { StatCard } from "../components/ui/StatCard";

export function AdminAnalyticsPage() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useApiData<AdminAnalyticsResponse>("/api/admin/analytics");

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            <div className="stats-grid stats-grid-four">
              <StatCard title={t("k_094")} value={data.schoolAverage.toFixed(2)} icon={BarChart3} />
              <StatCard title={t("k_025")} value={data.totalUsers} icon={Users} />
              <StatCard title={t("k_015")} value={data.eventsCount} icon={CalendarDays} />
              <StatCard title={t("k_014")} value={data.achievementsCount} icon={Trophy} />
              <StatCard title={t("k_139")} value={data.riskStudents} tone="warn" icon={AlertTriangle} />
            </div>

            <Section title={t("k_108")}>
              <MetricBarChart
                data={data.classComparison.map((item) => ({
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
                    <th>{t("k_139")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.classComparison.map((item) => (
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

