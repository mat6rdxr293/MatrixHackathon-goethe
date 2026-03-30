import { useState } from "react";
import { eventTypeLabelKey } from "../config/labels";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { formatDate } from "../lib/format";
import type { EventsResponse, EventType } from "../types/portal";
import { MetricBarChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

export function EventsPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<EventsResponse>("/api/events");
  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [upcomingOnly, setUpcomingOnly] = useState(false);

  const source = data ? (upcomingOnly ? data.upcoming : data.feed) : [];
  const filtered = source.filter((item) => (typeFilter === "all" ? true : item.type === typeFilter));

  const statMap = filtered.reduce(
    (acc, item) => {
      acc[item.type] += 1;
      return acc;
    },
    { news: 0, event: 0, announcement: 0 },
  );

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            <div className="filter-row">
              <div className="chip-group">
                <button
                  className={typeFilter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setTypeFilter("all")}
                >
                  {t("k_112")}
                </button>
                {(["news", "event", "announcement"] as EventType[]).map((type) => (
                  <button
                    key={type}
                    className={typeFilter === type ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                  >
                    {t(eventTypeLabelKey(type))}
                  </button>
                ))}
              </div>
              <button className="outline-button" type="button" onClick={() => setUpcomingOnly((prev) => !prev)}>
                {upcomingOnly ? t("k_113") : t("k_114")}
              </button>
            </div>

            <Section title={t("k_115")}>
              <MetricBarChart
                data={[
                  { label: t(eventTypeLabelKey("news")), value: statMap.news },
                  { label: t(eventTypeLabelKey("event")), value: statMap.event },
                  { label: t(eventTypeLabelKey("announcement")), value: statMap.announcement },
                ]}
                valueLabel={t("k_015")}
              />
            </Section>

            <Section title={t("k_115")}>
              <div className="list-grid">
                {filtered.map((item) => (
                  <article key={item.id} className="mini-card">
                    <div className="mini-head">
                      <h4>{item.title}</h4>
                      <span className="chip">{t(eventTypeLabelKey(item.type))}</span>
                    </div>
                    <p>{item.description}</p>
                    <div className="mini-meta">
                      <span>{formatDate(item.date, lang)}</span>
                      {item.important ? <strong>{t("k_116")}</strong> : null}
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}

