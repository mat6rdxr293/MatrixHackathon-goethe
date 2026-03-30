import { Pause, Play, Tv } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { formatDate } from "../lib/format";
import type { KioskResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { LanguageSwitch } from "../components/ui/LanguageSwitch";
import { PageTransition } from "../components/ui/PageTransition";

export function KioskPage() {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<KioskResponse>("/api/kiosk");

  const [slide, setSlide] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const slideCount = data?.scheduleUpdates && data.scheduleUpdates.length > 0 ? 5 : 4;

  useEffect(() => {
    if (!autoplay) {
      return;
    }

    const timer = window.setInterval(() => {
      setSlide((prev) => (prev + 1) % slideCount);
    }, 6000);

    return () => window.clearInterval(timer);
  }, [autoplay, slideCount]);

  return (
    <PageTransition>
      <div className="kiosk-shell">
        <div className="kiosk-toolbar">
          <Link className="outline-button link-button icon-button" to="/app/dashboard">
            <Tv size={16} />
            {t("k_154")}
          </Link>
          <button className="outline-button icon-button" type="button" onClick={() => setAutoplay((prev) => !prev)}>
            {autoplay ? <Pause size={16} /> : <Play size={16} />}
            {autoplay ? t("k_155") : t("k_156")}
          </button>
          <LanguageSwitch />
        </div>

        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <div className="kiosk-stage">
            <header>
              <h1>{data.fullscreenHero.title}</h1>
              <p>{data.fullscreenHero.subtitle}</p>
            </header>

            {slide === 0 ? (
              <section className="kiosk-panel">
                <h2>{t("k_157")}</h2>
                <div className="kiosk-cards">
                  {data.achievements.slice(0, 3).map((item) => (
                    <article key={item.id} className="kiosk-card">
                      <h3>{item.title}</h3>
                      <p>{item.badge}</p>
                      <span>{formatDate(item.date, lang)}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {slide === 1 ? (
              <section className="kiosk-panel">
                <h2>{t("k_024")}</h2>
                <div className="kiosk-cards">
                  {data.news.concat(data.upcomingEvents).map((item) => (
                    <article key={item.id} className="kiosk-card">
                      <h3>{item.title}</h3>
                      <p>{item.description}</p>
                      <span>{formatDate(item.date, lang)}</span>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {slide === 2 ? (
              <section className="kiosk-panel">
                <h2>{t("k_158")}</h2>
                <table className="data-table kiosk-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("k_126")}</th>
                      <th>{t("k_071")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topStudents.map((item) => (
                      <tr key={item.studentId}>
                        <td>{item.rank}</td>
                        <td>{item.name}</td>
                        <td>{item.averageScore.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}

            {slide === 3 ? (
              <section className="kiosk-panel">
                <h2>{t("k_159")}</h2>
                <ul className="kiosk-list">
                  {data.schoolHighlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {slide === 4 && data.scheduleUpdates && data.scheduleUpdates.length > 0 ? (
              <section className="kiosk-panel">
                <h2>{t("k_226")}</h2>
                <table className="data-table kiosk-table">
                  <thead>
                    <tr>
                      <th>{t("k_083")}</th>
                      <th>{t("k_208")}</th>
                      <th>{t("k_090")}</th>
                      <th>{t("k_103")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scheduleUpdates.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td>{item.classId}</td>
                        <td>{item.slot}</td>
                        <td>{item.subject}</td>
                        <td>
                          {item.status === "changed" ? (
                            <span className="chip warn">{t("k_206")}</span>
                          ) : (
                            <span className="chip bad">{t("k_207")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </PageTransition>
  );
}


