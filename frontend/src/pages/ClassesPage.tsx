import {
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  GraduationCap,
  UserRound,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { trendTone } from "../lib/api";
import type { ProgressResponse, StudentProfile } from "../types/portal";
import { MetricBarChart, StudentHistoryChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";
import { StatCard } from "../components/ui/StatCard";

type ClassInfo = {
  classId: string;
  averageScore: number;
  riskStudentIds: string[];
  teacherId?: string;
};

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const shortName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) {
    return fullName;
  }
  return `${parts[0]} ${parts[1][0]}.`;
};

const classInfoFromProgress = (data: ProgressResponse | null): ClassInfo[] => {
  if (!data) {
    return [];
  }

  if ("classes" in data) {
    return data.classes.map((item) => ({
      classId: item.classId,
      averageScore: item.averageScore,
      riskStudentIds: item.riskStudents.map((student) => student.studentId),
    }));
  }

  if ("byClass" in data) {
    return data.byClass.map((item) => ({
      classId: item.classId,
      averageScore: item.avgScore,
      riskStudentIds: item.riskStudents,
      teacherId: item.teacherId,
    }));
  }

  return [];
};

export function ClassesPage() {
  const { t } = useI18n();
  const progressState = useApiData<ProgressResponse>("/api/progress");
  const studentsState = useApiData<{ students: StudentProfile[] }>("/api/integrations/bilimclass/students");

  const classes = useMemo(
    () => classInfoFromProgress(progressState.data).sort((a, b) => b.averageScore - a.averageScore),
    [progressState.data],
  );

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const allStudents = useMemo(() => studentsState.data?.students ?? [], [studentsState.data]);

  const defaultClassId = useMemo(() => {
    const firstClassWithStudents = classes.find((item) =>
      allStudents.some((student) => student.classId === item.classId),
    );
    return firstClassWithStudents?.classId ?? classes[0]?.classId ?? null;
  }, [allStudents, classes]);

  const activeClassId = useMemo(() => {
    if (selectedClassId && classes.some((item) => item.classId === selectedClassId)) {
      return selectedClassId;
    }
    return defaultClassId;
  }, [classes, defaultClassId, selectedClassId]);

  const selectedClass = useMemo(
    () => classes.find((item) => item.classId === activeClassId) ?? null,
    [activeClassId, classes],
  );

  const classStudents = useMemo(() => {
    if (!activeClassId) {
      return [];
    }
    return allStudents
      .filter((student) => student.classId === activeClassId)
      .sort((a, b) => b.averageScore - a.averageScore);
  }, [activeClassId, allStudents]);

  const activeStudentId = useMemo(() => {
    if (selectedStudentId && classStudents.some((item) => item.studentId === selectedStudentId)) {
      return selectedStudentId;
    }
    return classStudents[0]?.studentId ?? null;
  }, [classStudents, selectedStudentId]);

  const selectedStudent = useMemo(
    () => classStudents.find((item) => item.studentId === activeStudentId) ?? null,
    [activeStudentId, classStudents],
  );

  const riskCount = useMemo(() => {
    if (!selectedClass) {
      return 0;
    }
    const riskIds = new Set(selectedClass.riskStudentIds);
    return classStudents.filter(
      (student) => riskIds.has(student.studentId) || student.progress.some((subject) => subject.risk),
    ).length;
  }, [classStudents, selectedClass]);

  const subjectAverages = useMemo(() => {
    const subjectMap = new Map<string, { sum: number; count: number; risk: number }>();

    for (const student of classStudents) {
      for (const subject of student.progress) {
        const current = subjectMap.get(subject.subject) ?? { sum: 0, count: 0, risk: 0 };
        current.sum += subject.current;
        current.count += 1;
        if (subject.risk) {
          current.risk += 1;
        }
        subjectMap.set(subject.subject, current);
      }
    }

    return [...subjectMap.entries()]
      .map(([subject, value]) => {
        const average = value.count === 0 ? 0 : value.sum / value.count;
        return {
          label: subject,
          value: Number(average.toFixed(2)),
          tone: value.risk > 0 ? ("warn" as const) : undefined,
        };
      })
      .sort((a, b) => a.value - b.value);
  }, [classStudents]);

  const loading = progressState.loading || studentsState.loading;
  const error = progressState.error ?? studentsState.error;

  const refresh = async () => {
    await Promise.all([progressState.refresh(), studentsState.refresh()]);
  };

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {!loading && !error ? (
          <>
            <Section title={t("k_164")}>
              {classes.length > 0 ? (
                <div className="class-grid">
                  {classes.map((item, index) => {
                    return (
                      <motion.button
                        key={item.classId}
                        type="button"
                        className={item.classId === activeClassId ? "class-pill active" : "class-pill"}
                        onClick={() => {
                          setSelectedClassId(item.classId);
                          setSelectedStudentId(null);
                        }}
                        initial="hidden"
                        animate="show"
                        variants={cardVariants}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        whileHover={{ y: -2 }}
                      >
                        <div className="class-pill-head">
                          <span className="chip">{t("k_083")}</span>
                          <strong>{item.classId}</strong>
                        </div>
                        <p>
                          {t("k_170")}: {item.averageScore.toFixed(1)}
                        </p>
                        <p>
                          {t("k_124")}: {item.riskStudentIds.length}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <p>{t("k_172")}</p>
              )}
            </Section>

            {selectedClass ? (
              <>
                <Section title={t("k_176")}>
                  <div className="stats-grid stats-grid-four">
                    <StatCard title={t("k_083")} value={selectedClass.classId} icon={GraduationCap} />
                    <StatCard title={t("k_169")} value={classStudents.length} icon={Users} />
                    <StatCard title={t("k_170")} value={selectedClass.averageScore.toFixed(1)} icon={BarChart3} />
                    <StatCard title={t("k_139")} value={riskCount} tone="warn" icon={AlertTriangle} />
                    <StatCard title={t("k_173")} value={selectedClass.teacherId ?? "-"} icon={UserRound} />
                  </div>
                </Section>

                <Section title={t("k_165")}>
                  {subjectAverages.length > 0 ? (
                    <MetricBarChart data={subjectAverages} valueLabel={t("k_102")} />
                  ) : (
                    <p>{t("k_171")}</p>
                  )}
                </Section>

                <Section title={t("k_166")}>
                  {classStudents.length > 0 ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t("k_126")}</th>
                          <th>{t("k_071")}</th>
                          <th>{t("k_178")}</th>
                          <th>{t("k_103")}</th>
                          <th>{t("k_045")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classStudents.map((student) => {
                          const isRisk =
                            selectedClass.riskStudentIds.includes(student.studentId) ||
                            student.progress.some((subject) => subject.risk);
                          const isActive = student.studentId === activeStudentId;
                          return (
                            <tr key={student.studentId} className={isActive ? "table-row-active" : ""}>
                              <td>{student.fullName}</td>
                              <td>{student.averageScore.toFixed(1)}</td>
                              <td>{student.weakSubjects.length}</td>
                              <td>
                                {isRisk ? (
                                  <span className="chip warn">{t("k_104")}</span>
                                ) : (
                                  <span className="chip good">{t("k_105")}</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => setSelectedStudentId(student.studentId)}
                                >
                                  {t("k_168")}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p>{t("k_171")}</p>
                  )}
                </Section>

                <Section title={t("k_167")}>
                  {selectedStudent ? (
                    <motion.div
                      className="class-profile-shell"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                    >
                      <div className="class-profile-card">
                        <h4>{selectedStudent.fullName}</h4>
                        <p>
                          {t("k_083")} {selectedStudent.classId}
                        </p>
                        <div className="chip-row">
                          {selectedStudent.weakSubjects.length > 0 ? (
                            selectedStudent.weakSubjects.map((subject) => (
                              <span key={subject} className="chip warn">
                                {subject}
                              </span>
                            ))
                          ) : (
                            <span className="chip good">{t("k_105")}</span>
                          )}
                        </div>

                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>{t("k_090")}</th>
                              <th>{t("k_091")}</th>
                              <th>{t("k_092")}</th>
                              <th>{t("k_103")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedStudent.progress.map((subject) => (
                              <tr key={subject.subject}>
                                <td>{subject.subject}</td>
                                <td>{subject.current.toFixed(1)}</td>
                                <td className={`trend ${trendTone(subject.trend)}`}>
                                  {subject.trend > 0 ? "+" : ""}
                                  {subject.trend}
                                </td>
                                <td>
                                  {subject.risk ? (
                                    <span className="chip warn">{t("k_104")}</span>
                                  ) : (
                                    <span className="chip good">{t("k_105")}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="class-profile-side">
                        <StatCard title={t("k_175")} value={shortName(selectedStudent.fullName)} icon={UserRound} />
                        <StatCard title={t("k_071")} value={selectedStudent.averageScore.toFixed(1)} icon={BarChart3} />
                        <StatCard title={t("k_074")} value={selectedStudent.weakSubjects.length} tone="warn" icon={AlertTriangle} />
                        <StatCard title={t("k_169")} value={classStudents.length} icon={BookOpenCheck} />
                      </div>
                    </motion.div>
                  ) : (
                    <p>{t("k_177")}</p>
                  )}
                </Section>

                {selectedStudent ? (
                  <Section title={t("k_174")}>
                    <StudentHistoryChart progress={selectedStudent.progress} scoreLabel={t("k_102")} />
                  </Section>
                ) : null}
              </>
            ) : (
              <Section title={t("k_165")}>
                <p>{t("k_172")}</p>
              </Section>
            )}
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
