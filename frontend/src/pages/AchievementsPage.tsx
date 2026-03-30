import { Award, Crown, Medal, Trophy, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { achievementTypeLabelKey } from "../config/labels";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { formatDate } from "../lib/format";
import type { AchievementType, AchievementsResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const podiumTone = (rank: number) => {
  if (rank === 1) return "podium-gold";
  if (rank === 2) return "podium-silver";
  if (rank === 3) return "podium-bronze";
  return "";
};

export function AchievementsPage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useApiData<AchievementsResponse>("/api/achievements");
  const [filter, setFilter] = useState<AchievementType | "all">("all");

  const filtered = data?.items.filter((item) => (filter === "all" ? true : item.type === filter)) ?? [];
  const topThree = useMemo(() => data?.leaderboard.slice(0, 3) ?? [], [data]);

  const podium = useMemo(() => {
    if (topThree.length < 3) {
      return topThree;
    }
    return [topThree[1], topThree[0], topThree[2]];
  }, [topThree]);

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            <div className="filter-row">
              <div className="chip-group">
                <button
                  className={filter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setFilter("all")}
                >
                  {t("k_109")}
                </button>
                {(["academic", "sport", "creative", "social"] as AchievementType[]).map((type) => (
                  <button
                    key={type}
                    className={filter === type ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setFilter(type)}
                  >
                    {t(achievementTypeLabelKey(type))}
                  </button>
                ))}
              </div>
            </div>

            <Section title={t("k_110")}>
              <div className="list-grid">
                {filtered.map((item) => (
                  <article key={item.id} className="mini-card">
                    <div className="mini-head">
                      <h4>{item.title}</h4>
                      <span className="chip">{t(achievementTypeLabelKey(item.type))}</span>
                    </div>
                    <p>{item.badge}</p>
                    <div className="mini-meta">
                      <span>{formatDate(item.date, lang)}</span>
                      <strong>{item.points} XP</strong>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            <Section title={t("k_111")}>
              {podium.length >= 3 ? (
                <div className="leaderboard-podium">
                  {podium.map((entry) => (
                    <button
                      key={entry.studentId}
                      className={`podium-card ${podiumTone(entry.rank)}`}
                      type="button"
                      onClick={() => navigate(`/app/students/${entry.studentId}`)}
                    >
                      <span className="podium-medal">
                        {entry.rank === 1 ? <Crown size={16} /> : <Medal size={16} />}
                      </span>
                      <div className="podium-avatar">{getInitials(entry.name)}</div>
                      <span className="podium-name">{entry.name}</span>
                      <span className="podium-score">{entry.averageScore.toFixed(1)}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <table className="data-table leaderboard-table" style={{ marginTop: "0.9rem" }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("k_001")}</th>
                    <th>{t("k_071")}</th>
                    <th>{t("k_014")}</th>
                    <th>{t("k_045")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((row) => (
                    <tr key={row.studentId}>
                      <td>
                        <span className="leaderboard-rank">#{row.rank}</span>
                      </td>
                      <td>
                        <div className="leaderboard-name-cell">
                          <div className="leaderboard-avatar">
                            <UserRound size={13} />
                          </div>
                          <span>{row.name}</span>
                        </div>
                      </td>
                      <td>
                        <strong style={{ fontSize: 14 }}>{row.averageScore.toFixed(1)}</strong>
                      </td>
                      <td>
                        {row.rank === 1 ? (
                          <span className="chip good">
                            <Crown size={13} />
                            Лидер
                          </span>
                        ) : row.rank <= 3 ? (
                          <span className="chip good">
                            <Award size={13} />
                            Топ {row.rank}
                          </span>
                        ) : (
                          <span className="chip">#{row.rank}</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="outline-button icon-button"
                          type="button"
                          onClick={() => navigate(`/app/students/${row.studentId}`)}
                        >
                          <Trophy size={14} />
                          Профиль
                        </button>
                      </td>
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

