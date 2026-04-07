import { Award, CheckCircle2, Crown, Medal, Trophy, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { achievementTypeLabelKey } from "../config/labels";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { getErrorMessage, privateApi } from "../lib/api";
import { formatDate } from "../lib/format";
import type { AchievementType, AchievementsResponse } from "../types/portal";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const MAX_PROOF_FILE_SIZE = 2 * 1024 * 1024;

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

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
  const { user } = useAuth();
  const { data, loading, error, refresh } = useApiData<AchievementsResponse>("/api/achievements");
  const [filter, setFilter] = useState<AchievementType | "all">("all");
  const [verificationFilter, setVerificationFilter] = useState<"all" | "verified" | "pending">("all");

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AchievementType>("academic");
  const [badge, setBadge] = useState("");
  const [proofReference, setProofReference] = useState("");
  const [proofNote, setProofNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [isSubmitModalOpen, setSubmitModalOpen] = useState(false);

  const canSubmit = data?.role === "student" || user?.role === "student";
  const canVerify = data?.role === "teacher" || data?.role === "admin";

  const filtered =
    data?.items.filter((item) => {
      const typeMatch = filter === "all" ? true : item.type === filter;
      const verification = item.verification?.status ?? "pending";
      const verificationMatch = verificationFilter === "all" ? true : verification === verificationFilter;
      return typeMatch && verificationMatch;
    }) ?? [];
  const topThree = useMemo(() => data?.leaderboard.slice(0, 3) ?? [], [data]);

  const podium = useMemo(() => {
    if (topThree.length < 3) {
      return topThree;
    }
    return [topThree[1], topThree[0], topThree[2]];
  }, [topThree]);

  const submitAchievement = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setSubmitMessage(null);

    if (title.trim().length < 2) {
      setFormError(t("title"));
      return;
    }

    setSubmitting(true);
    try {
      const normalizedReference = proofReference.trim();
      const referenceIsUrl = isHttpUrl(normalizedReference);
      const normalizedProofNote = proofNote.trim();

      const mergedProofNote = [
        referenceIsUrl ? "" : normalizedReference,
        normalizedProofNote,
      ]
        .filter((item) => item.length > 0)
        .join("\n");

      let proofAttachment:
        | {
            fileName: string;
            mimeType: string;
            dataUrl: string;
          }
        | undefined;

      if (proofFile) {
        if (proofFile.size > MAX_PROOF_FILE_SIZE) {
          setFormError(t("file_more_2_mb"));
          setSubmitting(false);
          return;
        }
        const dataUrl = await readFileAsDataUrl(proofFile);
        proofAttachment = {
          fileName: proofFile.name,
          mimeType: proofFile.type || "application/octet-stream",
          dataUrl,
        };
      }

      await privateApi.post("/api/achievements", {
        title: title.trim(),
        type,
        badge: badge.trim() || t("achievements"),
        proofUrl: referenceIsUrl ? normalizedReference : undefined,
        proofNote: mergedProofNote || undefined,
        proofAttachment,
      });
      setTitle("");
      setBadge("");
      setProofReference("");
      setProofNote("");
      setProofFile(null);
      setSubmitMessage(t("account_successfully_created"));
      setSubmitModalOpen(false);
      await refresh();
    } catch (submissionError) {
      setFormError(getErrorMessage(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAchievement = async (achievementId: string, evidence?: string) => {
    setVerifyingId(achievementId);
    setFormError(null);
    try {
      await privateApi.post(`/api/achievements/${achievementId}/verify`, {
        method: "teacher-review",
        evidence,
      });
      await refresh();
    } catch (verificationError) {
      setFormError(getErrorMessage(verificationError));
    } finally {
      setVerifyingId(null);
    }
  };

  useEffect(() => {
    if (!isSubmitModalOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSubmitModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitModalOpen]);

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data ? (
          <>
            {canSubmit ? (
              <section className="users-actions-card content-compose-actions">
                <div className="users-actions-copy">
                  <h3>{t("new_content")}</h3>
                  <p>{t("cards_achievements")}</p>
                </div>
                <button
                  className="solid-button content-compose-open"
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setSubmitMessage(null);
                    setSubmitModalOpen(true);
                  }}
                >
                  {t("new_content")}
                </button>
              </section>
            ) : null}

            {canSubmit ? (
              <>
                <button
                  className={isSubmitModalOpen ? "users-modal-backdrop show" : "users-modal-backdrop"}
                  type="button"
                  aria-hidden={isSubmitModalOpen ? "false" : "true"}
                  tabIndex={-1}
                  onClick={() => setSubmitModalOpen(false)}
                />

                <aside className={isSubmitModalOpen ? "users-modal content-compose-modal open" : "users-modal content-compose-modal"}>
                  <header className="users-modal-head">
                    <h3>{t("new_content")}</h3>
                    <button className="icon-btn users-modal-close" type="button" onClick={() => setSubmitModalOpen(false)}>
                      <X size={18} />
                    </button>
                  </header>

                  <form className="admin-form content-compose-form" onSubmit={submitAchievement}>
                    <label>
                      {t("title")}
                      <input value={title} onChange={(event) => setTitle(event.target.value)} required />
                    </label>
                    <label>
                      {t("type")}
                      <select value={type} onChange={(event) => setType(event.target.value as AchievementType)}>
                        {(["academic", "sport", "creative", "social"] as AchievementType[]).map((entryType) => (
                          <option key={entryType} value={entryType}>
                            {t(achievementTypeLabelKey(entryType))}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("successes")}
                      <input value={badge} onChange={(event) => setBadge(event.target.value)} />
                    </label>
                    <label>
                      {t("link_or_text")}
                      <input
                        type="text"
                        placeholder="https://"
                        value={proofReference}
                        onChange={(event) => setProofReference(event.target.value)}
                      />
                    </label>
                    <label>
                      {t("attachment")}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt"
                        onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <label>
                      {t("description")}
                      <textarea value={proofNote} onChange={(event) => setProofNote(event.target.value)} />
                    </label>
                    {proofFile ? (
                      <div className="chip-row">
                        <span className="chip good">
                          {t("file_attached")}: {proofFile.name}
                        </span>
                        <button className="outline-button" type="button" onClick={() => setProofFile(null)}>
                          {t("remove_file")}
                        </button>
                      </div>
                    ) : null}
                    {formError ? <p className="form-error">{formError}</p> : null}
                    {submitMessage ? <p className="success-text">{submitMessage}</p> : null}
                    <button className="solid-button content-publish-button" type="submit" disabled={submitting}>
                      {submitting ? `${t("publishing")}...` : t("publish")}
                    </button>
                  </form>
                </aside>
              </>
            ) : null}

            <div className="filter-row">
              <div className="chip-group">
                <button
                  className={filter === "all" ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setFilter("all")}
                >
                  {t("all")}
                </button>
                {(["academic", "sport", "creative", "social"] as AchievementType[]).map((entryType) => (
                  <button
                    key={entryType}
                    className={filter === entryType ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setFilter(entryType)}
                  >
                    {t(achievementTypeLabelKey(entryType))}
                  </button>
                ))}
              </div>
              <div className="chip-group">
                {(["all", "verified", "pending"] as const).map((status) => (
                  <button
                    key={status}
                    className={verificationFilter === status ? "chip-button active" : "chip-button"}
                    type="button"
                    onClick={() => setVerificationFilter(status)}
                  >
                    {status === "all" ? t("all") : status === "verified" ? t("verified") : t("for_pending")}
                  </button>
                ))}
              </div>
            </div>

            <Section title={t("cards_achievements")}>
              <div className="list-grid">
                {filtered.map((item) => (
                  <article key={item.id} className="mini-card">
                    <div className="mini-head">
                      <h4>{item.title}</h4>
                      <span className="chip">{t(achievementTypeLabelKey(item.type))}</span>
                    </div>
                    <p>{item.badge}</p>
                    {item.proofUrl || item.proofNote || item.proofAttachment ? (
                      <div className="mini-proof">
                        {item.proofUrl ? (
                          <a href={item.proofUrl} target="_blank" rel="noreferrer">
                            {t("proof")}
                          </a>
                        ) : null}
                        {item.proofAttachment ? (
                          <a href={item.proofAttachment.dataUrl} download={item.proofAttachment.fileName}>
                            {item.proofAttachment.fileName}
                          </a>
                        ) : null}
                        {item.proofNote ? <span>{item.proofNote}</span> : null}
                      </div>
                    ) : null}
                    <div className="chip-row">
                      <span className={item.verification?.status === "verified" ? "chip good" : "chip warn"}>
                        {item.verification?.status === "verified" ? t("verified") : t("for_pending")}
                      </span>
                      {item.verification?.verifiedBy ? (
                        <span className="chip">
                          {t("verified_by")}: {item.verification.verifiedBy}
                        </span>
                      ) : null}
                      {canVerify && item.verification?.status !== "verified" ? (
                        <button
                          type="button"
                          className="outline-button icon-button"
                          disabled={verifyingId === item.id}
                          onClick={() =>
                            verifyAchievement(
                              item.id,
                              item.proofAttachment?.fileName || item.proofUrl || item.proofNote || item.badge,
                            )
                          }
                        >
                          <CheckCircle2 size={14} />
                          {verifyingId === item.id ? `${t("refresh_status")}...` : t("refresh_status")}
                        </button>
                      ) : null}
                    </div>
                    <div className="mini-meta">
                      <span>{formatDate(item.date, lang)}</span>
                      <strong>{item.points} XP</strong>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            <Section title={t("rating")}>
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
                    <th>{t("student")}</th>
                    <th>{t("average_score")}</th>
                    <th>{t("achievements")}</th>
                    <th>{t("verification")}</th>
                    <th>{t("view_features")}</th>
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
                            {t("leader")}
                          </span>
                        ) : row.rank <= 3 ? (
                          <span className="chip good">
                            <Award size={13} />
                            {t("top")} {row.rank}
                          </span>
                        ) : (
                          <span className="chip">#{row.rank}</span>
                        )}
                      </td>
                      <td>
                        {(() => {
                          const achievement = data.items.find((item) => item.studentId === row.studentId);
                          const status = achievement?.verification?.status ?? "pending";
                          return (
                            <span className={status === "verified" ? "chip good" : "chip warn"}>
                              {status === "verified" ? t("verified") : t("for_pending")}
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        <button
                          className="outline-button icon-button"
                          type="button"
                          onClick={() => navigate(`/app/students/${row.studentId}`)}
                        >
                          <Trophy size={14} />
                          {t("profile_2")}
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
