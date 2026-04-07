import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import type { Lang, ScheduleResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const getLocaleTag = (lang: Lang) => (lang === "kk" ? "kk-KZ" : "ru-RU");

const getDayLabel = (day: number, lang: Lang) => {
  if (day < 1 || day > 7) {
    return String(day);
  }
  const date = new Date(Date.UTC(2024, 0, day));
  const raw = new Intl.DateTimeFormat(getLocaleTag(lang), { weekday: "short" }).format(date).replace(".", "");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

export function SchedulePage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<ScheduleResponse>("/api/schedule");

  const [dayFilter, setDayFilter] = useState<number | "all">("all");

  const items = useMemo(() => {
    const source = data?.items ?? [];
    const filtered = source.filter((item) => (dayFilter === "all" ? true : item.day === dayFilter));
    return [...filtered].sort((a, b) => a.day - b.day || a.slot - b.slot || a.classId.localeCompare(b.classId));
  }, [data?.items, dayFilter]);

  const groupedByDay = useMemo(() => {
    const byDay = new Map<number, typeof items>();
    for (const item of items) {
      const list = byDay.get(item.day) ?? [];
      list.push(item);
      byDay.set(item.day, list);
    }
    return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  }, [items]);

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
              title={t("schedule")}
              action={
                <div className="chip-group">
                  <button
                    type="button"
                    className={dayFilter === "all" ? "chip-button active" : "chip-button"}
                    onClick={() => setDayFilter("all")}
                  >
                    {t("all")}
                  </button>
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={dayFilter === day ? "chip-button active" : "chip-button"}
                      onClick={() => setDayFilter(day)}
                    >
                      {getDayLabel(day, lang)}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="chip-row">
                <span className="chip">
                  {t("events")}: {items.length}
                </span>
                <span className="chip warn">
                  {t("replacement")}: {byStatus.changed}
                </span>
                <span className="chip bad">
                  {t("cancelled")}: {byStatus.cancelled}
                </span>
              </div>
            </Section>

            <Section title={t("schedule")}> 
              {items.length > 0 ? (
                <div className="schedule-day-grid">
                  {groupedByDay.map(([day, dayItems]) => (
                    <article key={day} className="schedule-day-card">
                      <header>
                        <h4>{getDayLabel(day, lang)}</h4>
                        <span className="chip">{dayItems.length}</span>
                      </header>
                      <div className="schedule-lesson-list">
                        {dayItems.map((item) => (
                          <div key={item.id} className="schedule-lesson-row">
                            <span className="schedule-slot">#{item.slot}</span>
                            <div className="schedule-lesson-main">
                              <strong>
                                {item.subject}
                                {item.groupName ? <span className="muted-inline"> ({item.groupName})</span> : null}
                              </strong>
                              <div className="schedule-lesson-meta">
                                <span>{t("curator")}: {item.teacherId}</span>
                                <span>{t("room")}: {item.room}</span>
                                <span>{t("class")}: {item.classId}</span>
                              </div>
                            </div>
                            <div>
                              {item.status === "planned" ? <span className="chip good">{t("by_plan")}</span> : null}
                              {item.status === "changed" ? <span className="chip warn">{t("replacement")}</span> : null}
                              {item.status === "cancelled" ? <span className="chip bad">{t("cancelled")}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state-inline">
                  <CalendarClock size={18} />
                  <span>{t("schedule_yet_not_filled")}</span>
                </div>
              )}
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
