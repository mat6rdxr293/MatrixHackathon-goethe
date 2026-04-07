import {
  ArrowLeft,
  Brain,
  CalendarCheck,
  Flame,
  Medal,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StudentHistoryChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { getErrorMessage, privateApi } from "../lib/api";
import { trendTone } from "../lib/api";
import { formatDate } from "../lib/format";
import type {
  BilimBindingStatusResponse,
  BilimBindingUpdateResponse,
  SafeUser,
  StudentProfileCardResponse,
} from "../types/portal";

type ProfileTab = "overview" | "grades" | "attendance" | "achievements" | "ai";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) {
    return name.slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function scoreTone(score: number) {
  if (score >= 4.5) return "good";
  if (score >= 3.5) return "warn";
  return "bad";
}

function SelfRoleProfile({ user }: { user: SafeUser }) {
  const { t } = useI18n();

  return (
    <div className="section-card">
      <div className="profile-simple-header">
        <div className="profile-simple-avatar">{initials(user.name)}</div>
        <div>
          <h2 className="profile-simple-name">{user.name}</h2>
          <p className="profile-simple-role">{t("profile")}</p>
          <p className="profile-simple-email">{user.email}</p>
        </div>
      </div>
    </div>
  );
}

function BilimClassBindingModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<BilimBindingStatusResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await privateApi.get<BilimBindingStatusResponse>("/api/profile/bilimclass");
      setStatus(response.data);
      setLogin(response.data.login ?? "");
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void loadStatus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await privateApi.put<BilimBindingUpdateResponse>("/api/profile/bilimclass", {
        login: login.trim(),
        password,
      });
      setStatus(response.data);
      setPassword("");
      setLogin(response.data.login ?? login.trim());
      setSuccess(
        response.data.accountName
          ? `${t("bilimclass_link_success")}: ${response.data.accountName}`
          : t("bilimclass_link_success"),
      );
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setUnlinking(true);
    setFormError(null);
    setSuccess(null);
    try {
      const response = await privateApi.delete<BilimBindingStatusResponse>("/api/profile/bilimclass");
      setStatus(response.data);
      setPassword("");
      setSuccess(t("bilimclass_link_removed"));
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setUnlinking(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <button className="users-modal-backdrop show" type="button" onClick={onClose} aria-label={t("close")} />
      <aside className="users-modal profile-bilim-modal open" aria-hidden={false}>
        <header className="users-modal-head">
          <div>
            <h3>{t("bilimclass_link_title")}</h3>
            <p className="profile-bilim-sub">{t("bilimclass_link_description")}</p>
          </div>
          <button className="icon-btn users-modal-close" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="section-head">
          <span className={status?.linked ? "chip good" : "chip"}>
            {status?.linked ? t("connected") : t("not_connected")}
          </span>
        </div>

        {status?.linked ? (
          <div className="profile-bilim-meta">
            <span className="chip">{status.login ?? "-"}</span>
            {status.linkedAt ? (
              <span className="muted-inline">
                {t("last_sync")}: {formatDate(status.linkedAt, lang)}
              </span>
            ) : null}
          </div>
        ) : null}

        <DataState loading={loading} error={loadError} onRetry={loadStatus} />

        {!loading ? (
          <form className="admin-form profile-bilim-form" onSubmit={submit}>
            <label>
              {t("email_label")}
              <input
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="student@bilimclass.kz"
                autoComplete="username"
                required
              />
            </label>
            <label>
              {t("password_field")}
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </label>

            <div className="action-row">
              <button className="solid-button" type="submit" disabled={saving || unlinking}>
                {saving
                  ? t("publishing")
                  : status?.linked
                    ? t("refresh_bilimclass_link_button")
                    : t("connect_bilimclass_button")}
              </button>
              {status?.linked ? (
                <button className="outline-button" type="button" onClick={disconnect} disabled={saving || unlinking}>
                  {unlinking ? t("publishing") : t("unlink_bilimclass_button")}
                </button>
              ) : null}
            </div>

            {formError ? <p className="form-error">{formError}</p> : null}
            {success ? <p className="success-text">{success}</p> : null}
          </form>
        ) : null}
      </aside>
    </>
  );
}

function StudentProfilePanel({
  studentId,
  isOwn,
  canOpenBilimBinding,
  onOpenBilimBinding,
}: {
  studentId: string;
  isOwn: boolean;
  canOpenBilimBinding?: boolean;
  onOpenBilimBinding?: () => void;
}) {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<ProfileTab>("overview");
  const profileState = useApiData<StudentProfileCardResponse>(
    `/api/student-profiles/${encodeURIComponent(studentId)}`,
  );

  const data = profileState.data;

  const attendanceByMonth = useMemo(() => {
    if (!data) {
      return [] as { month: string; percent: number }[];
    }

    const base = data.attendancePercent;
    const months = [t("oct"), t("nov"), t("dec"), t("jan"), t("feb"), t("mar")];
    return months.map((month, index) => ({
      month,
      percent: Math.max(80, Math.min(99, base - 4 + index)),
    }));
  }, [data, t]);

  return (
    <>
      {!isOwn ? (
        <button className="outline-button icon-button profile-back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
          {t("back_in_room")}
        </button>
      ) : null}

      <DataState loading={profileState.loading} error={profileState.error} onRetry={profileState.refresh} />

      {data ? (
        <>
          <section className="student-profile-hero">
            <div className="student-profile-avatar">{initials(data.student.fullName)}</div>
            <div className="student-profile-headline">
              <div className="student-profile-title-row">
                <div>
                  <h2>{data.student.fullName}</h2>
                  <p>
                    {t("class")} {data.student.classId} · ID: {data.student.studentId}
                  </p>
                </div>
                {canOpenBilimBinding ? (
                  <button className="profile-bilim-open-button" type="button" onClick={onOpenBilimBinding}>
                    {t("bilimclass_link_title")}
                  </button>
                ) : null}
              </div>
              <div className="student-profile-topstats">
                <div>
                  <strong>{data.student.averageScore.toFixed(1)}</strong>
                  <span>{t("average")}</span>
                </div>
                <div>
                  <strong>{data.achievements.length}</strong>
                  <span>{t("achievements_2")}</span>
                </div>
                <div>
                  <strong>{data.attendancePercent}%</strong>
                  <span>{t("attendance")}</span>
                </div>
                <div>
                  <strong>{data.rank ? `#${data.rank}` : "—"}</strong>
                  <span>{t("place")}</span>
                </div>
              </div>
              <div className="chip-row">
                {data.student.weakSubjects.length > 0 ? (
                  data.student.weakSubjects.slice(0, 4).map((item) => (
                    <span key={item} className="chip warn">
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="chip good">{t("all_good")}</span>
                )}
              </div>
            </div>
          </section>

          <div className="student-profile-tabs">
            {[
              ["overview", t("overview")],
              ["grades", t("grades")],
              ["attendance", t("attendance")],
              ["achievements", t("achievements")],
              ["ai", t("ai_review")],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "student-profile-tab active" : "student-profile-tab"}
                type="button"
                onClick={() => setTab(id as ProfileTab)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className="student-profile-grid">
              <Section title={t("performance")}>
                <div className="subject-bars-list">
                  {data.student.progress.map((subject) => {
                    const width = Math.min(100, Math.round((subject.current / 5) * 100));
                    return (
                      <div key={subject.subject} className="subject-bar-item">
                        <div className="subject-bar-head">
                          <span>{subject.subject}</span>
                          <strong>{subject.current.toFixed(1)}</strong>
                        </div>
                        <div className="subject-bar-track">
                          <div className={`subject-bar-fill ${scoreTone(subject.current)}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="profile-history-wrap">
                  <StudentHistoryChart progress={data.student.progress} scoreLabel={t("score")} />
                </div>
              </Section>

              <div className="student-profile-side">
                <div className="student-mini-cards">
                  <article className="student-mini-card">
                    <p>{t("position")}</p>
                    <strong>{data.rank ? `#${data.rank}` : "—"}</strong>
                    <span>{t("in_school")}</span>
                  </article>
                  <article className="student-mini-card">
                    <p>{t("points")}</p>
                    <strong>{data.points}</strong>
                    <span>XP</span>
                  </article>
                  <article className="student-mini-card">
                    <p>{t("streak")}</p>
                    <strong>{data.streakDays}</strong>
                    <span>{t("days")}</span>
                  </article>
                  <article className="student-mini-card">
                    <p>{t("attendance_2")}</p>
                    <strong>{data.attendancePercent}%</strong>
                    <span>{t("for_month")}</span>
                  </article>
                </div>

                <Section title={t("recent_grades")}>
                  <div className="recent-grade-list">
                    {data.recentGrades.slice(0, 6).map((grade) => (
                      <div key={`${grade.subject}-${grade.date}-${grade.score}`} className="recent-grade-item">
                        <div>
                          <strong>{grade.subject}</strong>
                          <span>{formatDate(grade.date, lang)}</span>
                        </div>
                        <span className={`grade-pill ${scoreTone(grade.score)}`}>{Math.round(grade.score)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>

              <Section title={t("achievements")}>
                <div className="achievement-stack">
                  {data.achievements.slice(0, 3).map((item) => (
                    <article key={item.id} className="achievement-stack-item">
                      <div className="achievement-icon">
                        <Medal size={17} />
                      </div>
                      <div>
                        <strong>{item.title}</strong>
                        <span>{item.badge}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </Section>

              <section className="profile-ai-panel">
                <h3>
                  <Brain size={16} />
                  {t("ai_analytics")}
                </h3>
                <p className="profile-ai-sub">{t("personal_review_data")}</p>
                <div className="profile-ai-risk">{data.ai.riskLabel}</div>
                <p>{data.ai.summary}</p>
                <div className="profile-ai-box">
                  <small>{t("action")}</small>
                  <span>{data.ai.action}</span>
                </div>
                <div className="profile-ai-box">
                  <small>{t("option")}</small>
                  <span>{data.ai.opportunity}</span>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "grades" ? (
            <Section title={t("all_grades_by_subjects")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("subject")}</th>
                    <th>{t("current")}</th>
                    <th>{t("trend")}</th>
                    <th>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.student.progress.map((subject) => (
                    <tr key={subject.subject}>
                      <td>{subject.subject}</td>
                      <td>{subject.current.toFixed(1)}</td>
                      <td className={`trend ${trendTone(subject.trend)}`}>
                        {subject.trend > 0 ? "+" : ""}
                        {subject.trend.toFixed(1)}
                      </td>
                      <td>
                        {subject.risk ? (
                          <span className="chip warn">{t("risk")}</span>
                        ) : (
                          <span className="chip good">{t("normal")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {tab === "attendance" ? (
            <div className="student-profile-grid compact">
              <Section title={t("attendance_by_months")}>
                <div className="attendance-months">
                  {attendanceByMonth.map((item) => (
                    <div key={item.month} className="attendance-month-item">
                      <div>
                        <strong>{item.month}</strong>
                        <span>{item.percent}%</span>
                      </div>
                      <div className="attendance-track">
                        <div style={{ width: `${item.percent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title={t("summary")}>
                <div className="attendance-summary">
                  <div>
                    <CalendarCheck size={16} />
                    <strong>{data.attendancePercent}%</strong>
                    <span>{t("average_attendance")}</span>
                  </div>
                  <div>
                    <Flame size={16} />
                    <strong>{data.streakDays}</strong>
                    <span>{t("days_without_absences")}</span>
                  </div>
                  <div>
                    <TrendingUp size={16} />
                    <strong>{Math.max(0, 100 - data.student.weakSubjects.length * 8)}%</strong>
                    <span>{t("study_stability")}</span>
                  </div>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === "achievements" ? (
            <Section title={t("all_achievements")}>
              <div className="achievement-stack">
                {data.achievements.length === 0 ? (
                  <p className="muted-inline">{t("achievements_yet_none")}</p>
                ) : (
                  data.achievements.map((item) => (
                    <article key={item.id} className="achievement-stack-item">
                      <div className="achievement-icon">
                        <Star size={17} />
                      </div>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.badge} · {formatDate(item.date, lang)}
                        </span>
                      </div>
                      <span className="chip good">+{item.points} XP</span>
                    </article>
                  ))
                )}
              </div>
            </Section>
          ) : null}

          {tab === "ai" ? (
            <section className="profile-ai-panel standalone">
              <h3>
                <Brain size={16} />
                {t("ai_analytics")}
              </h3>
              <p className="profile-ai-sub">{t("personal_review_data")}</p>
              <div className="profile-ai-risk">{data.ai.riskLabel}</div>
              <p>{data.ai.summary}</p>
              <div className="profile-ai-box">
                <small>{t("action")}</small>
                <span>{data.ai.action}</span>
              </div>
              <div className="profile-ai-box">
                <small>{t("option")}</small>
                <span>{data.ai.opportunity}</span>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const { studentId: routeStudentId } = useParams();
  const [isBilimModalOpen, setBilimModalOpen] = useState(false);

  const ownStudentId = useMemo(() => {
    if (!user) return null;
    if (user.role === "student") return user.linkedStudentId ?? user.id;
    if (user.role === "parent") return user.linkedStudentId ?? null;
    return null;
  }, [user]);

  const targetStudentId = routeStudentId ?? ownStudentId;
  const canOpenBilimBinding = Boolean(user && !routeStudentId && user.role === "student");

  return (
    <PageTransition>
      <div className="page-layout profile-page">
        {user ? (
          <>
            {targetStudentId ? (
              <StudentProfilePanel
                studentId={targetStudentId}
                isOwn={!routeStudentId}
                canOpenBilimBinding={canOpenBilimBinding}
                onOpenBilimBinding={() => setBilimModalOpen(true)}
              />
            ) : (
              <SelfRoleProfile user={user} />
            )}
            {canOpenBilimBinding ? (
              <BilimClassBindingModal isOpen={isBilimModalOpen} onClose={() => setBilimModalOpen(false)} />
            ) : null}
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
