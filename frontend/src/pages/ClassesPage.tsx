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
            <Section title={t("grid_classes")}>
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
                          <span className="chip">{t("class")}</span>
                          <strong>{item.classId}</strong>
                        </div>
                        <p>
                          {t("average_score_class")}: {item.averageScore.toFixed(1)}
                        </p>
                        <p>
                          {t("risks")}: {item.riskStudentIds.length}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              ) : (
                <p>{t("select_class_for_view_analytics")}</p>
              )}
            </Section>

            {selectedClass ? (
              <>
                <Section title={t("metrics_class")}>
                  <div className="stats-grid stats-grid-four">
                    <StatCard title={t("class")} value={selectedClass.classId} icon={GraduationCap} />
                    <StatCard title={t("students_in_class")} value={classStudents.length} icon={Users} />
                    <StatCard title={t("average_score_class")} value={selectedClass.averageScore.toFixed(1)} icon={BarChart3} />
                    <StatCard title={t("at_risk_students")} value={riskCount} tone="warn" icon={AlertTriangle} />
                    <StatCard title={t("curator_class")} value={selectedClass.teacherId ?? "-"} icon={UserRound} />
                  </div>
                </Section>

                <Section title={t("overview_class")}>
                  {subjectAverages.length > 0 ? (
                    <MetricBarChart data={subjectAverages} valueLabel={t("score")} />
                  ) : (
                    <p>{t("in_this_class_yet_none_students")}</p>
                  )}
                </Section>

                <Section title={t("list_class")}>
                  {classStudents.length > 0 ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t("name")}</th>
                          <th>{t("average_score")}</th>
                          <th>{t("at_risk_subjects")}</th>
                          <th>{t("status")}</th>
                          <th>{t("view_features")}</th>
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
                                  <span className="chip warn">{t("need_support")}</span>
                                ) : (
                                  <span className="chip good">{t("stable")}</span>
                                )}
                              </td>
                              <td>
                                <button
                                  className="ghost-button"
                                  type="button"
                                  onClick={() => setSelectedStudentId(student.studentId)}
                                >
                                  {t("open_profile")}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p>{t("in_this_class_yet_none_students")}</p>
                  )}
                </Section>

                <Section title={t("profile_student")}>
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
                          {t("class")} {selectedStudent.classId}
                        </p>
                        <div className="chip-row">
                          {selectedStudent.weakSubjects.length > 0 ? (
                            selectedStudent.weakSubjects.map((subject) => (
                              <span key={subject} className="chip warn">
                                {subject}
                              </span>
                            ))
                          ) : (
                            <span className="chip good">{t("stable")}</span>
                          )}
                        </div>

                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>{t("subject")}</th>
                              <th>{t("current_score")}</th>
                              <th>{t("trend")}</th>
                              <th>{t("status")}</th>
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
                                    <span className="chip warn">{t("need_support")}</span>
                                  ) : (
                                    <span className="chip good">{t("stable")}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="class-profile-side">
                        <StatCard title={t("student_in_focus")} value={shortName(selectedStudent.fullName)} icon={UserRound} />
                        <StatCard title={t("average_score")} value={selectedStudent.averageScore.toFixed(1)} icon={BarChart3} />
                        <StatCard title={t("weak_subjects")} value={selectedStudent.weakSubjects.length} tone="warn" icon={AlertTriangle} />
                        <StatCard title={t("students_in_class")} value={classStudents.length} icon={BookOpenCheck} />
                      </div>
                    </motion.div>
                  ) : (
                    <p>{t("select_student_from_list")}</p>
                  )}
                </Section>

                {selectedStudent ? (
                  <Section title={t("performance_student_by_subjects")}>
                    <StudentHistoryChart progress={selectedStudent.progress} scoreLabel={t("score")} />
                  </Section>
                ) : null}
              </>
            ) : (
              <Section title={t("overview_class")}>
                <p>{t("select_class_for_view_analytics")}</p>
              </Section>
            )}
          </>
        ) : null}
      </div>
    </PageTransition>
  );
}
