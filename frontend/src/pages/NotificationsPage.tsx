import { Bell, CalendarClock, Megaphone } from "lucide-react";
import { useMemo, useState } from "react";
import { type LocaleKey } from "../contexts/localeTypes";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { formatDate } from "../lib/format";
import type { NotificationsResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

type NotificationFilter = "all" | "schedule" | "event" | "achievement" | "system";

const iconByType = {
  schedule: CalendarClock,
  event: Megaphone,
  achievement: Bell,
  system: Bell,
};

const notificationTypeLabelKey = (type: NotificationFilter): LocaleKey => {
  if (type === "schedule") return "k_205";
  if (type === "event") return "k_015";
  if (type === "achievement") return "k_014";
  if (type === "system") return "k_236";
  return "k_109";
};

export function NotificationsPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<NotificationsResponse>("/api/notifications");
  const [filter, setFilter] = useState<NotificationFilter>("all");

  const items = useMemo(
    () =>
      (data?.items ?? []).filter((item) => {
        if (filter === "all") {
          return true;
        }
        return item.type === filter;
      }),
    [data?.items, filter],
  );

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            <Section
              title={t("k_211")}
              action={
                <div className="chip-group">
                  {(["all", "schedule", "event", "achievement", "system"] as NotificationFilter[]).map((type) => (
                    <button
                      key={type}
                      className={filter === type ? "chip-button active" : "chip-button"}
                      type="button"
                      onClick={() => setFilter(type)}
                    >
                      {t(notificationTypeLabelKey(type))}
                    </button>
                  ))}
                </div>
              }
            >
              <div className="list-grid">
                {items.map((item) => {
                  const Icon = iconByType[item.type];
                  return (
                    <article key={item.id} className="mini-card">
                      <div className="mini-head">
                        <h4>{item.title}</h4>
                        <span className="chip">
                          <Icon size={12} /> {t(notificationTypeLabelKey(item.type))}
                        </span>
                      </div>
                      <p>{item.message}</p>
                      <div className="mini-meta">
                        <span>{formatDate(item.createdAt, lang)}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
              {items.length === 0 ? <p>{t("k_212")}</p> : null}
            </Section>
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
