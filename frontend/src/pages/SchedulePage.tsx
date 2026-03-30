import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import type { ScheduleResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const dayLabels = ["-", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function SchedulePage() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useApiData<ScheduleResponse>("/api/schedule");

  const [dayFilter, setDayFilter] = useState<number | "all">("all");

  const items = useMemo(() => {
    const source = data?.items ?? [];
    return source.filter((item) => (dayFilter === "all" ? true : item.day === dayFilter));
  }, [data?.items, dayFilter]);

  const byStatus = useMemo(
    () => ({
      changed: (data?.items ?? []).filter((item) => item.status === "changed").length,
      cancelled: (data?.items ?? []).filter((item) => item.status === "cancelled").length,
    }),
    [data?.items],
  );

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            <Section
              title={t("k_205")}
              action={
                <div className="chip-group">
                  <button
                    type="button"
                    className={dayFilter === "all" ? "chip-button active" : "chip-button"}
                    onClick={() => setDayFilter("all")}
                  >
                    {t("k_109")}
                  </button>
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={dayFilter === day ? "chip-button active" : "chip-button"}
                      onClick={() => setDayFilter(day)}
                    >
                      {dayLabels[day]}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="chip-row">
                <span className="chip">
                  {t("k_015")}: {items.length}
                </span>
                <span className="chip warn">
                  {t("k_206")}: {byStatus.changed}
                </span>
                <span className="chip bad">
                  {t("k_207")}: {byStatus.cancelled}
                </span>
              </div>
            </Section>

            <Section title={t("k_205")}> 
              {items.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t("k_148")}</th>
                      <th>{t("k_208")}</th>
                      <th>{t("k_083")}</th>
                      <th>{t("k_090")}</th>
                      <th>{t("k_182")}</th>
                      <th>{t("k_209")}</th>
                      <th>{t("k_103")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{dayLabels[item.day] ?? item.day}</td>
                        <td>{item.slot}</td>
                        <td>{item.classId}</td>
                        <td>
                          {item.subject}
                          {item.groupName ? <span className="muted-inline"> ({item.groupName})</span> : null}
                        </td>
                        <td>{item.teacherId}</td>
                        <td>{item.room}</td>
                        <td>
                          {item.status === "planned" ? <span className="chip good">{t("k_237")}</span> : null}
                          {item.status === "changed" ? <span className="chip warn">{t("k_206")}</span> : null}
                          {item.status === "cancelled" ? <span className="chip bad">{t("k_207")}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state-inline">
                  <CalendarClock size={18} />
                  <span>{t("k_210")}</span>
                </div>
              )}
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}

