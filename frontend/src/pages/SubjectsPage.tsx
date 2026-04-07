import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import type { StudentJournalResponse } from "../types/portal";
import {
  BookOpen,
  Calculator,
  Circle,
  FlaskConical,
  Leaf,
  Globe,
  Languages,
  Landmark,
  Cpu,
  ExternalLink,
  ChevronRight,
  Star,
  Trophy,
  Zap,
} from "lucide-react";

export type SubjectMeta = {
  id: string;
  nameRu: string;
  nameKk: string;
  icon: React.ReactNode;
  color: string;
  accent: string;
  tasksCount: number;
  description: string;
};

export const SUBJECTS: SubjectMeta[] = [
  {
    id: "algebra",
    nameRu: "Алгебра",
    nameKk: "Алгебра",
    icon: <Calculator size={28} />,
    color: "#4F46E5",
    accent: "#EEF2FF",
    tasksCount: 15,
    description: "Многочлены, схема Горнера, рациональные корни",
  },
  {
    id: "geometry",
    nameRu: "Геометрия",
    nameKk: "Геометрия",
    icon: <Circle size={28} />,
    color: "#0891B2",
    accent: "#ECFEFF",
    tasksCount: 12,
    description: "Треугольники, окружности, стереометрия",
  },
  {
    id: "physics",
    nameRu: "Физика",
    nameKk: "Физика",
    icon: <Zap size={28} />,
    color: "#D97706",
    accent: "#FFFBEB",
    tasksCount: 12,
    description: "Механика, электричество, оптика",
  },
  {
    id: "chemistry",
    nameRu: "Химия",
    nameKk: "Химия",
    icon: <FlaskConical size={28} />,
    color: "#7C3AED",
    accent: "#F5F3FF",
    tasksCount: 10,
    description: "Реакции, стехиометрия, органика",
  },
  {
    id: "biology",
    nameRu: "Биология",
    nameKk: "Биология",
    icon: <Leaf size={28} />,
    color: "#059669",
    accent: "#ECFDF5",
    tasksCount: 10,
    description: "Клетки, генетика, экология",
  },
  {
    id: "russian",
    nameRu: "Русский язык",
    nameKk: "Орыс тілі",
    icon: <BookOpen size={28} />,
    color: "#DC2626",
    accent: "#FEF2F2",
    tasksCount: 8,
    description: "Грамматика, синтаксис, орфография",
  },
  {
    id: "kazakh",
    nameRu: "Казахский язык",
    nameKk: "Қазақ тілі",
    icon: <Languages size={28} />,
    color: "#B45309",
    accent: "#FFFBEB",
    tasksCount: 8,
    description: "Грамматика, лексика, морфология",
  },
  {
    id: "history",
    nameRu: "История Казахстана",
    nameKk: "Қазақстан тарихы",
    icon: <Landmark size={28} />,
    color: "#1D4ED8",
    accent: "#EFF6FF",
    tasksCount: 8,
    description: "Древняя история, государственность, современность",
  },
  {
    id: "informatics",
    nameRu: "Информатика",
    nameKk: "Информатика",
    icon: <Cpu size={28} />,
    color: "#374151",
    accent: "#F9FAFB",
    tasksCount: 10,
    description: "Алгоритмы, структуры данных, программирование",
  },
  {
    id: "geography",
    nameRu: "География",
    nameKk: "География",
    icon: <Globe size={28} />,
    color: "#047857",
    accent: "#ECFDF5",
    tasksCount: 8,
    description: "Физическая и экономическая география",
  },
];

export const SUBJECT_LAB_NAMES: Record<string, string> = {
  algebra: "Algebra Lab",
  geometry: "Geometry Lab",
  physics: "Physics Lab",
  chemistry: "Chem Lab",
  biology: "Bio Lab",
  russian: "Russian Lab",
  kazakh: "Kazakh Lab",
  history: "History Lab",
  informatics: "Computer Lab",
  geography: "Geography Lab",
};

export function getSubjectLabName(subjectId: string) {
  return SUBJECT_LAB_NAMES[subjectId] ?? "Subject Lab";
}

type SessionsResponse = {
  items: { subject: string; score: number; completedAt: string }[];
};

function getSubjectGrade(
  subjectId: string,
  journal: StudentJournalResponse | null,
): number | null {
  if (!journal) return null;
  const map: Record<string, string[]> = {
    algebra: ["алгебра", "algebra", "математика"],
    geometry: ["геометрия", "geometry"],
    physics: ["физика", "physics"],
    chemistry: ["химия", "chemistry"],
    biology: ["биология", "biology"],
    russian: ["русский", "russian", "rus"],
    kazakh: ["казах", "kazakh", "қазақ"],
    history: ["история", "history", "тарих"],
    informatics: ["информатика", "informatics", "computer"],
    geography: ["география", "geography"],
  };
  const keywords = map[subjectId] ?? [subjectId];
  const found = journal.subjects.find((s) =>
    keywords.some((kw) => s.subjectName.toLowerCase().includes(kw)),
  );
  return found?.averageScore ?? null;
}

function getSubjectSessions(
  subjectId: string,
  sessions: { subject: string; score: number; completedAt: string }[],
) {
  return sessions.filter((s) => s.subject === subjectId);
}

export function SubjectsPage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { user } = useAuth();

  const journal = useApiData<StudentJournalResponse>(
    user?.role === "student" || user?.role === "parent" ? "/api/journal" : null,
  );

  const sessions = useApiData<SessionsResponse>("/api/subject-practice/sessions");

  const sessionItems = sessions.data?.items ?? [];

  const totalSessions = sessionItems.length;
  const avgPracticeScore =
    sessionItems.length > 0
      ? Math.round(sessionItems.reduce((s, i) => s + i.score, 0) / sessionItems.length)
      : null;

  const subjectsWithActivity = new Set(sessionItems.map((i) => i.subject)).size;

  return (
    <PageTransition>
      <div className="page-layout">
        {/* Header stats */}
        <div className="subjects-stats-row">
          <div className="subjects-stat-card">
            <Trophy size={18} style={{ color: "#F59E0B" }} />
            <div>
              <strong>{totalSessions}</strong>
              <span>{t("practice_sessions")}</span>
            </div>
          </div>
          {avgPracticeScore !== null && (
            <div className="subjects-stat-card">
              <Star size={18} style={{ color: "#6366F1" }} />
              <div>
                <strong>{avgPracticeScore}%</strong>
                <span>{t("avg_practice_score")}</span>
              </div>
            </div>
          )}
          <div className="subjects-stat-card">
            <BookOpen size={18} style={{ color: "#059669" }} />
            <div>
              <strong>{subjectsWithActivity}</strong>
              <span>{t("subjects_practiced")}</span>
            </div>
          </div>
        </div>

        <Section title={t("subjects_hub_title")}>
          <div className="subjects-grid">
            {SUBJECTS.map((sub) => {
              const grade = getSubjectGrade(sub.id, journal.data);
              const practiceItems = getSubjectSessions(sub.id, sessionItems);
              const lastSession = practiceItems[0];

              return (
                <button
                  key={sub.id}
                  className="subject-card"
                  style={{ "--subject-color": sub.color, "--subject-accent": sub.accent } as React.CSSProperties}
                  onClick={() => navigate(`/app/subjects/${sub.id}`)}
                >
                  <div className="subject-card-icon" style={{ background: sub.accent, color: sub.color }}>
                    {sub.icon}
                  </div>
                  <div className="subject-card-body">
                    <div className="subject-card-header">
                      <h3>{lang === "kk" ? sub.nameKk : sub.nameRu}</h3>
                      <span className="subject-lab-badge">
                        <Zap size={11} /> {getSubjectLabName(sub.id)}
                      </span>
                    </div>
                    <p className="subject-card-desc">{sub.description}</p>
                    <div className="subject-card-footer">
                      <span className="subject-tasks-count">{sub.tasksCount} {t("tasks_count")}</span>
                      {grade !== null && (
                        <span
                          className={`subject-grade-badge ${grade >= 4 ? "good" : grade >= 3 ? "avg" : "warn"}`}
                        >
                          {grade.toFixed(1)} {t("current_score_short")}
                        </span>
                      )}
                      {practiceItems.length > 0 && (
                        <span className="subject-sessions-badge">
                          {practiceItems.length} {t("sessions_short")}
                        </span>
                      )}
                    </div>
                    {lastSession && (
                      <div className="subject-last-session">
                        {t("last_practice")}: {lastSession.score}%
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="subject-card-arrow" style={{ color: sub.color }} />
                </button>
              );
            })}
          </div>
        </Section>

        {/* Subject Labs CTA */}
        <Section title="Labs">
          <div className="practice-lab-cta">
            <div className="practice-lab-cta-text">
              <FlaskConical size={32} style={{ color: "#4F46E5" }} />
              <div>
                <h3>All Subject Labs</h3>
                <p>Computer Lab, Chem Lab, Physics Lab and more.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {SUBJECTS.map((sub) => (
                <button
                  key={`${sub.id}-lab`}
                  className="practice-lab-btn"
                  onClick={() => navigate(`/app/subjects/${sub.id}`)}
                >
                  {getSubjectLabName(sub.id)}
                  <ExternalLink size={15} />
                </button>
              ))}
            </div>
          </div>
        </Section>
      </div>
    </PageTransition>
  );
}
