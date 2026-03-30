import {
  ArrowLeft,
  Brain,
  CalendarCheck,
  Flame,
  Medal,
  Star,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { StudentHistoryChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { useApiData } from "../hooks/useApiData";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { trendTone } from "../lib/api";
import { formatDate } from "../lib/format";
import type { SafeUser, StudentProfileCardResponse } from "../types/portal";

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
          <p className="profile-simple-role">{t("k_017")}</p>
          <p className="profile-simple-email">{user.email}</p>
        </div>
      </div>
    </div>
  );
}

function StudentProfilePanel({ studentId, isOwn }: { studentId: string; isOwn: boolean }) {
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
    const months = ["Окт", "Ноя", "Дек", "Янв", "Фев", "Мар"];
    return months.map((month, index) => ({
      month,
      percent: Math.max(80, Math.min(99, base - 4 + index)),
    }));
  }, [data]);

  return (
    <>
      {!isOwn ? (
        <button className="outline-button icon-button profile-back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeft size={15} />
          Назад
        </button>
      ) : null}

      <DataState loading={profileState.loading} error={profileState.error} onRetry={profileState.refresh} />

      {data ? (
        <>
          <section className="student-profile-hero">
            <div className="student-profile-avatar">{initials(data.student.fullName)}</div>
            <div className="student-profile-headline">
              <h2>{data.student.fullName}</h2>
              <p>
                Класс {data.student.classId} · ID: {data.student.studentId}
              </p>
              <div className="student-profile-topstats">
                <div>
                  <strong>{data.student.averageScore.toFixed(1)}</strong>
                  <span>Средний</span>
                </div>
                <div>
                  <strong>{data.achievements.length}</strong>
                  <span>Достижений</span>
                </div>
                <div>
                  <strong>{data.attendancePercent}%</strong>
                  <span>Посещаемость</span>
                </div>
                <div>
                  <strong>{data.rank ? `#${data.rank}` : "—"}</strong>
                  <span>Место</span>
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
                  <span className="chip good">Все хорошо</span>
                )}
              </div>
            </div>
          </section>

          <div className="student-profile-tabs">
            {[
              ["overview", "Обзор"],
              ["grades", "Оценки"],
              ["attendance", "Посещаемость"],
              ["achievements", "Достижения"],
              ["ai", "AI-разбор"],
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
              <Section title="Успеваемость">
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
                  <StudentHistoryChart progress={data.student.progress} scoreLabel={t("k_102")} />
                </div>
              </Section>

              <div className="student-profile-side">
                <div className="student-mini-cards">
                  <article className="student-mini-card">
                    <p>Позиция</p>
                    <strong>{data.rank ? `#${data.rank}` : "—"}</strong>
                    <span>в школе</span>
                  </article>
                  <article className="student-mini-card">
                    <p>Очков</p>
                    <strong>{data.points}</strong>
                    <span>XP</span>
                  </article>
                  <article className="student-mini-card">
                    <p>Streak</p>
                    <strong>{data.streakDays}</strong>
                    <span>дней</span>
                  </article>
                  <article className="student-mini-card">
                    <p>Посещ.</p>
                    <strong>{data.attendancePercent}%</strong>
                    <span>за месяц</span>
                  </article>
                </div>

                <Section title="Последние оценки">
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

              <Section title="Достижения">
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
                  AI-аналитика
                </h3>
                <p className="profile-ai-sub">Персональный разбор данных</p>
                <div className="profile-ai-risk">{data.ai.riskLabel}</div>
                <p>{data.ai.summary}</p>
                <div className="profile-ai-box">
                  <small>ДЕЙСТВИЕ</small>
                  <span>{data.ai.action}</span>
                </div>
                <div className="profile-ai-box">
                  <small>ВОЗМОЖНОСТЬ</small>
                  <span>{data.ai.opportunity}</span>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "grades" ? (
            <Section title="Все оценки по предметам">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Предмет</th>
                    <th>Текущий</th>
                    <th>Тренд</th>
                    <th>Статус</th>
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
                        {subject.risk ? <span className="chip warn">Риск</span> : <span className="chip good">Норма</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ) : null}

          {tab === "attendance" ? (
            <div className="student-profile-grid compact">
              <Section title="Посещаемость по месяцам">
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

              <Section title="Сводка">
                <div className="attendance-summary">
                  <div>
                    <CalendarCheck size={16} />
                    <strong>{data.attendancePercent}%</strong>
                    <span>средняя посещаемость</span>
                  </div>
                  <div>
                    <Flame size={16} />
                    <strong>{data.streakDays}</strong>
                    <span>дней без пропусков</span>
                  </div>
                  <div>
                    <TrendingUp size={16} />
                    <strong>{Math.max(0, 100 - data.student.weakSubjects.length * 8)}%</strong>
                    <span>учебная стабильность</span>
                  </div>
                </div>
              </Section>
            </div>
          ) : null}

          {tab === "achievements" ? (
            <Section title="Все достижения">
              <div className="achievement-stack">
                {data.achievements.length === 0 ? (
                  <p className="muted-inline">Достижений пока нет</p>
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
                AI-аналитика
              </h3>
              <p className="profile-ai-sub">Персональный разбор данных</p>
              <div className="profile-ai-risk">{data.ai.riskLabel}</div>
              <p>{data.ai.summary}</p>
              <div className="profile-ai-box">
                <small>ДЕЙСТВИЕ</small>
                <span>{data.ai.action}</span>
              </div>
              <div className="profile-ai-box">
                <small>ВОЗМОЖНОСТЬ</small>
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

  const ownStudentId = useMemo(() => {
    if (!user) return null;
    if (user.role === "student") return user.linkedStudentId ?? user.id;
    if (user.role === "parent") return user.linkedStudentId ?? null;
    return null;
  }, [user]);

  const targetStudentId = routeStudentId ?? ownStudentId;

  return (
    <PageTransition>
      <div className="page-layout profile-page">
        {user ? (
          targetStudentId ? (
            <StudentProfilePanel studentId={targetStudentId} isOwn={!routeStudentId} />
          ) : (
            <SelfRoleProfile user={user} />
          )
        ) : null}
      </div>
    </PageTransition>
  );
}
