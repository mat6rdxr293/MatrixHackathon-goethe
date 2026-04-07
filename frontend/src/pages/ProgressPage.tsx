import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useI18n } from "../hooks/useI18n";
import { useApiData } from "../hooks/useApiData";
import { trendTone } from "../lib/api";
import type { ProgressResponse, StudentJournalResponse, SubjectProgress } from "../types/portal";
import { MetricBarChart, StudentHistoryChart } from "../components/charts/Charts";
import { DataState } from "../components/ui/DataState";
import { PageTransition } from "../components/ui/PageTransition";
import { Section } from "../components/ui/Section";

const getPeriodLabel = (period: number, periodType: string) => {
  const normalizedType = periodType.trim().toLowerCase();
  if (normalizedType === "quarter") {
    return `${period} \u0447\u0435\u0442\u0432\u0435\u0440\u0442\u044c`;
  }
  if (normalizedType === "halfyear") {
    return `${period} \u043f\u043e\u043b\u0443\u0433\u043e\u0434\u0438\u0435`;
  }
  if (normalizedType === "year") {
    return `${period} \u0443\u0447\u0435\u0431\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434`;
  }
  return `${period} (${periodType})`;
};

const normalizePeriodTypeLabel = (periodType: string) => {
  const normalizedType = periodType.trim().toLowerCase();
  if (normalizedType === "quarter") {
    return "\u0427\u0435\u0442\u0432\u0435\u0440\u0442\u044c";
  }
  if (normalizedType === "halfyear") {
    return "\u041f\u043e\u043b\u0443\u0433\u043e\u0434\u0438\u0435";
  }
  if (normalizedType === "year") {
    return "\u0413\u043e\u0434";
  }
  return periodType;
};

const normalizeMarkType = (value?: string) => {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "sor" || normalized === "\u0441\u043e\u0440") {
    return "sor";
  }
  if (normalized === "soch" || normalized === "\u0441\u043e\u0447") {
    return "soch";
  }
  return "regular";
};
type JournalGradeTone = "grade2" | "grade3" | "grade4" | "grade5" | "neutral";

const sanitizeJournalScoreText = (value: string) =>
  value
    .replace(/РІР‚вЂќ/g, "-")
    .replace(/вЂ”/g, "-")
    .replace(/—/g, "-")
    .replace(/вЂ/g, "-")
    .replace(/-{2,}/g, "-")
    .trim();

const hasVisibleScore = (value: string | null | undefined) => {
  const text = sanitizeJournalScoreText(value ?? "");
  if (!text || text === "-") {
    return false;
  }
  if (/^-\s*\/\s*\d+(?:[.,]\d+)?$/.test(text)) {
    return false;
  }
  return /\d/.test(text);
};

const parseFirstNumber = (value: string) => {
  const match = value.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const rkPercentToFivePoint = (percent: number) => {
  const normalized = Math.max(0, Math.min(100, percent));
  if (normalized <= 42) {
    return 2;
  }
  if (normalized <= 64) {
    return 3;
  }
  if (normalized <= 84) {
    return 4;
  }
  return 5;
};

const toFivePointFromJournalGrade = (grade: StudentJournalResponse["grades"][number]) => {
  const raw = sanitizeJournalScoreText(grade.scoreRaw ?? "");
  if (!raw || raw === "-") {
    if (typeof grade.scoreFive === "number" && Number.isFinite(grade.scoreFive)) {
      const fallbackPercent = (grade.scoreFive / 5) * 100;
      return rkPercentToFivePoint(fallbackPercent);
    }
    return null;
  }

  const fraction = raw.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (fraction) {
    const numerator = Number(fraction[1].replace(",", "."));
    const denominator = Number(fraction[2].replace(",", "."));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return rkPercentToFivePoint((numerator / denominator) * 100);
    }
  }

  const directValue = parseFirstNumber(raw);
  if (directValue === null) {
    return null;
  }

  if (typeof grade.markMax === "number" && Number.isFinite(grade.markMax) && grade.markMax > 0) {
    return rkPercentToFivePoint((directValue / grade.markMax) * 100);
  }

  if (directValue >= 2 && directValue <= 5 && Math.abs(directValue - Math.round(directValue)) < 0.000001) {
    return Math.round(directValue);
  }

  let percent: number;
  if (directValue <= 5) {
    percent = directValue * 20;
  } else if (directValue <= 10) {
    percent = directValue * 10;
  } else if (directValue <= 25) {
    percent = (directValue / 25) * 100;
  } else if (directValue <= 100) {
    percent = directValue;
  } else {
    percent = 100;
  }
  return rkPercentToFivePoint(percent);
};

const resolveGradePercent = (grade: StudentJournalResponse["grades"][number]) => {
  const raw = sanitizeJournalScoreText(grade.scoreRaw ?? "");
  if (!raw) {
    return null;
  }

  const fraction = raw.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  if (fraction) {
    const numerator = Number(fraction[1].replace(",", "."));
    const denominator = Number(fraction[2].replace(",", "."));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      return (numerator / denominator) * 100;
    }
  }

  const directValue = parseFirstNumber(raw);
  if (directValue !== null && typeof grade.markMax === "number" && Number.isFinite(grade.markMax) && grade.markMax > 0) {
    return (directValue / grade.markMax) * 100;
  }

  if (typeof grade.scoreFive === "number" && Number.isFinite(grade.scoreFive)) {
    return (grade.scoreFive / 5) * 100;
  }

  if (directValue === null) {
    return null;
  }
  if (directValue <= 5) {
    return (directValue / 5) * 100;
  }
  if (directValue <= 10) {
    return (directValue / 10) * 100;
  }

  return null;
};

const resolveGradeTone = (grade: StudentJournalResponse["grades"][number]): JournalGradeTone => {
  const percent = resolveGradePercent(grade);
  if (percent === null || !Number.isFinite(percent)) {
    return "neutral";
  }
  if (percent <= 42) {
    return "grade2";
  }
  if (percent <= 64) {
    return "grade3";
  }
  if (percent <= 84) {
    return "grade4";
  }
  return "grade5";
};

const resolveFinalMarkTone = (finalMark: string | null): JournalGradeTone => {
  const raw = sanitizeJournalScoreText(finalMark ?? "");
  if (!raw) {
    return "neutral";
  }

  const fraction = raw.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  let percent: number | null = null;
  if (fraction) {
    const numerator = Number(fraction[1].replace(",", "."));
    const denominator = Number(fraction[2].replace(",", "."));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
      percent = (numerator / denominator) * 100;
    }
  } else {
    const direct = parseFirstNumber(raw);
    if (direct !== null) {
      if (direct <= 5) {
        percent = (direct / 5) * 100;
      } else if (direct <= 10) {
        percent = (direct / 10) * 100;
      } else if (direct <= 100) {
        percent = direct;
      }
    }
  }

  if (percent === null || !Number.isFinite(percent)) {
    return "neutral";
  }
  if (percent <= 42) {
    return "grade2";
  }
  if (percent <= 64) {
    return "grade3";
  }
  if (percent <= 84) {
    return "grade4";
  }
  return "grade5";
};

const getGradePillClassName = (grade: StudentJournalResponse["grades"][number]) =>
  `journal-grade-pill journal-grade-pill-${resolveGradeTone(grade)}`;

const getFinalMarkPillClassName = (finalMark: string | null) =>
  `journal-grade-pill journal-grade-pill-final journal-grade-pill-${resolveFinalMarkTone(finalMark)}`;

const calculateSubjectCurrentAndTrend = (history: Array<{ date: string; score: number }>) => {
  if (history.length === 0) {
    return { current: 0, trend: 0 };
  }

  const current = Number(
    (history.reduce((sum, point) => sum + point.score, 0) / history.length).toFixed(2),
  );
  if (history.length < 2) {
    return { current, trend: 0 };
  }

  const windowSize = Math.min(3, Math.max(1, Math.floor(history.length / 2)));
  const recent = history.slice(-windowSize);
  const previous = history.slice(-(windowSize * 2), -windowSize);
  if (previous.length === 0) {
    return { current, trend: 0 };
  }

  const recentAvg = recent.reduce((sum, point) => sum + point.score, 0) / recent.length;
  const previousAvg = previous.reduce((sum, point) => sum + point.score, 0) / previous.length;
  return {
    current,
    trend: Number((recentAvg - previousAvg).toFixed(2)),
  };
};

export function ProgressPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const progressPath = useMemo(() => `/api/progress?lang=${lang}`, [lang]);
  const { data, loading, error, refresh } = useApiData<ProgressResponse>(progressPath);
  const [subjectFilter, setSubjectFilter] = useState<"all" | "risk">("all");
  const [selectedHistorySubjects, setSelectedHistorySubjects] = useState<string[]>([]);
  const [journalYear, setJournalYear] = useState<number | null>(null);
  const [journalPeriod, setJournalPeriod] = useState<number | null>(null);
  const [journalPeriodType, setJournalPeriodType] = useState<string | null>(null);

  const journalPath = useMemo(() => {
    if (!user || (user.role !== "student" && user.role !== "parent")) {
      return null;
    }

    const params = new URLSearchParams();
    if (typeof journalYear === "number" && Number.isFinite(journalYear)) {
      params.set("eduYear", String(journalYear));
    }
    if (typeof journalPeriod === "number" && Number.isFinite(journalPeriod)) {
      params.set("period", String(journalPeriod));
    }
    if (journalPeriodType && journalPeriodType.trim()) {
      params.set("periodType", journalPeriodType.trim());
    }
    params.set("lang", lang);

    const query = params.toString();
    return query ? `/api/journal?${query}` : "/api/journal";
  }, [journalPeriod, journalPeriodType, journalYear, lang, user]);

  const journalState = useApiData<StudentJournalResponse>(journalPath);

  useEffect(() => {
    if (!journalState.data) {
      return;
    }
    const selected = journalState.data.selected;
    setJournalYear((prev) => (prev === selected.eduYear ? prev : selected.eduYear));
    setJournalPeriod((prev) => (prev === selected.period ? prev : selected.period));
    setJournalPeriodType((prev) =>
      prev === selected.periodType ? prev : selected.periodType,
    );
  }, [journalState.data]);

  const journalSubjectProgress = useMemo(() => {
    if (!journalState.data) {
      return [];
    }

    const bySubject = new Map<
      string,
      {
        subject: string;
        history: Array<{ date: string; score: number }>;
      }
    >();

    const sortedGrades = [...journalState.data.grades].sort((a, b) => {
      const left = `${a.lessonDate} ${a.lessonTime ?? ""}`.trim();
      const right = `${b.lessonDate} ${b.lessonTime ?? ""}`.trim();
      return left.localeCompare(right);
    });

    for (const grade of sortedGrades) {
      const subjectName = grade.subjectName.trim();
      if (!subjectName || !hasVisibleScore(grade.scoreRaw)) {
        continue;
      }
      const score = toFivePointFromJournalGrade(grade);
      if (score === null || !Number.isFinite(score)) {
        continue;
      }

      const key = subjectName.toLowerCase();
      const row = bySubject.get(key) ?? {
        subject: subjectName,
        history: [],
      };
      row.history.push({
        date: grade.lessonDate,
        score: Number(score.toFixed(2)),
      });
      bySubject.set(key, row);
    }

    return [...bySubject.values()]
      .map((row) => {
        const history = [...row.history].sort((a, b) => +new Date(a.date) - +new Date(b.date));
        if (history.length === 0) {
          return null;
        }
        const { current, trend } = calculateSubjectCurrentAndTrend(history);
        return {
          subject: row.subject,
          current: Number(current.toFixed(2)),
          trend,
          risk: current < 4,
          history,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [journalState.data]);

  const allStudentSubjects = useMemo(() => {
    const fallback =
      data && "student" in data && data.student
        ? data.student.progress
        : [];
    return journalSubjectProgress.length > 0 ? journalSubjectProgress : fallback;
  }, [data, journalSubjectProgress]);

  const studentSubjects = useMemo(
    () => allStudentSubjects.filter((item) => (subjectFilter === "risk" ? item.risk : true)),
    [allStudentSubjects, subjectFilter],
  );

  const overallTimeline = useMemo<SubjectProgress[]>(() => {
    if (allStudentSubjects.length === 0) {
      return [];
    }

    const byDate = new Map<string, number[]>();
    for (const subject of allStudentSubjects) {
      for (const point of subject.history) {
        const bucket = byDate.get(point.date) ?? [];
        bucket.push(point.score);
        byDate.set(point.date, bucket);
      }
    }

    const history = [...byDate.entries()]
      .sort((a, b) => +new Date(a[0]) - +new Date(b[0]))
      .map(([date, scores]) => ({
        date,
        score: Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(2)),
      }));

    if (history.length === 0) {
      return [];
    }

    const current = history[history.length - 1].score;
    const trend = history.length >= 2 ? Number((history[history.length - 1].score - history[history.length - 2].score).toFixed(2)) : 0;

    return [
      {
        subject: `${t("average")} ${t("score").toLowerCase()}`,
        current,
        trend,
        risk: current < 4,
        history,
      },
    ];
  }, [allStudentSubjects, t]);

  const historySubjectOptions = useMemo(
    () => [...new Set(allStudentSubjects.map((item) => item.subject))].sort((a, b) => a.localeCompare(b)),
    [allStudentSubjects],
  );

  useEffect(() => {
    setSelectedHistorySubjects((prev) =>
      prev.filter((subject) => historySubjectOptions.includes(subject)).slice(0, 3),
    );
  }, [historySubjectOptions]);

  const historyChartProgress = useMemo(() => {
    if (selectedHistorySubjects.length === 0) {
      return overallTimeline;
    }

    const bySubject = new Map(allStudentSubjects.map((item) => [item.subject, item] as const));
    return selectedHistorySubjects
      .map((subject) => bySubject.get(subject))
      .filter((item): item is SubjectProgress => Boolean(item));
  }, [allStudentSubjects, overallTimeline, selectedHistorySubjects]);

  const handleHistorySubjectToggle = (subject: string) => {
    setSelectedHistorySubjects((prev) => {
      if (prev.includes(subject)) {
        return prev.filter((item) => item !== subject);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, subject];
    });
  };

  const selectedJournalPeriodType =
    journalPeriodType ?? journalState.data?.selected.periodType ?? "quarter";

  const journalRows = useMemo(() => {
    if (!journalState.data) {
      return [] as Array<{
        subjectName: string;
        regular: StudentJournalResponse["grades"];
        sor: StudentJournalResponse["grades"];
        soch: StudentJournalResponse["grades"];
        finalMark: string | null;
      }>;
    }

    const summaryBySubject = new Map(
      journalState.data.subjects.map((item) => [item.subjectName.trim().toLowerCase(), item] as const),
    );

    const bySubject = new Map<
      string,
      {
        subjectName: string;
        regular: StudentJournalResponse["grades"];
        sor: StudentJournalResponse["grades"];
        soch: StudentJournalResponse["grades"];
        finalMark: string | null;
      }
    >();

    const sortedGrades = [...journalState.data.grades].sort((a, b) => {
      const left = `${a.lessonDate} ${a.lessonTime ?? ""}`.trim();
      const right = `${b.lessonDate} ${b.lessonTime ?? ""}`.trim();
      return left.localeCompare(right);
    });

    for (const grade of sortedGrades) {
      const key = grade.subjectName.trim().toLowerCase();
      if (!key) {
        continue;
      }
      const normalizedScoreRaw = sanitizeJournalScoreText(grade.scoreRaw ?? "");
      if (!hasVisibleScore(normalizedScoreRaw)) {
        continue;
      }
      const row = bySubject.get(key) ?? {
        subjectName: grade.subjectName,
        regular: [],
        sor: [],
        soch: [],
        finalMark: summaryBySubject.get(key)?.finalMark ?? null,
      };
      const normalizedGrade =
        normalizedScoreRaw === grade.scoreRaw ? grade : { ...grade, scoreRaw: normalizedScoreRaw };

      const type = normalizeMarkType(normalizedGrade.markType);
      if (type === "sor") {
        row.sor.push(normalizedGrade);
      } else if (type === "soch") {
        row.soch.push(normalizedGrade);
      } else {
        row.regular.push(normalizedGrade);
      }

      bySubject.set(key, row);
    }

    for (const [key, subjectSummary] of summaryBySubject.entries()) {
      if (!bySubject.has(key)) {
        bySubject.set(key, {
          subjectName: subjectSummary.subjectName,
          regular: [],
          sor: [],
          soch: [],
          finalMark: subjectSummary.finalMark ?? null,
        });
      }
    }

    return [...bySubject.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }, [journalState.data]);

  return (
    <PageTransition>
      <div className="page-layout">
        <DataState loading={loading} error={error} onRetry={refresh} />

        {data && "student" in data && data.student ? (
          <>
            <div className="chip-row">
              <button
                className={subjectFilter === "all" ? "chip-button active" : "chip-button"}
                type="button"
                onClick={() => setSubjectFilter("all")}
              >
                {t("all_subjects")}
              </button>
              <button
                className={subjectFilter === "risk" ? "chip-button active" : "chip-button"}
                type="button"
                onClick={() => setSubjectFilter("risk")}
              >
                {t("only_risk")}
              </button>
            </div>

            <Section title={t("all_grades_by_subjects")}>
              <DataState loading={journalState.loading} error={journalState.error} onRetry={journalState.refresh} />

              {journalState.data ? (
                <div className="journal-section">
                  <div className="journal-toolbar">
                    <label>
                      {t("study_year")}
                      <select
                        value={journalYear ?? journalState.data.selected.eduYear}
                        onChange={(event) => setJournalYear(Number(event.target.value))}
                      >
                        {journalState.data.filters.years.map((item) => (
                          <option key={item} value={item}>
                            {item}-{item + 1}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      {t("type_period_type")}
                      <select
                        value={journalPeriodType ?? journalState.data.selected.periodType}
                        onChange={(event) => {
                          setJournalPeriodType(event.target.value);
                          setJournalPeriod(null);
                        }}
                      >
                        {journalState.data.filters.periodTypes.map((item) => (
                          <option key={item} value={item}>
                            {normalizePeriodTypeLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      {t("period")}
                      <select
                        value={journalPeriod ?? journalState.data.selected.period}
                        onChange={(event) => setJournalPeriod(Number(event.target.value))}
                      >
                        {journalState.data.filters.periods.map((item) => (
                          <option key={item} value={item}>
                            {getPeriodLabel(item, selectedJournalPeriodType)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="chip-row">
                    <span className={`chip ${journalState.data.source === "bilimclass" ? "good" : ""}`}>
                      {t("source_3")}:{" "}
                      {journalState.data.source === "bilimclass"
                        ? "BilimClass"
                        : journalState.data.source === "cache"
                          ? t("fallback_data")
                          : t("none_data")}
                    </span>
                    <span className="chip">
                      {t("subjects")}: {journalState.data.stats.subjects}
                    </span>
                    <span className="chip">
                      {t("grades_2")}: {journalState.data.stats.grades}
                    </span>
                  </div>

                  <table className="data-table journal-table">
                    <thead>
                      <tr>
                        <th className="journal-col-index">№</th>
                        <th className="journal-col-subject">{t("subject")}</th>
                        <th className="journal-col-grades">{t("grades_2")}</th>
                        <th className="journal-col-sor">{t("sor")}</th>
                        <th className="journal-col-soch">{t("soch")}</th>
                        <th className="journal-col-final">Итог</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journalRows.length > 0 ? (
                        journalRows.map((row, index) => (
                          <tr key={row.subjectName}>
                            <td>{index + 1}</td>
                            <td>{row.subjectName}</td>
                            <td className="journal-col-grades-cell">
                              <div className="journal-grade-grid">
                                {row.regular.length > 0 ? (
                                  row.regular.map((grade) => (
                                    <span key={grade.id} className={getGradePillClassName(grade)}>
                                      {sanitizeJournalScoreText(grade.scoreRaw)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="journal-empty-mark">-</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="journal-grade-grid">
                                {row.sor.length > 0 ? (
                                  row.sor.map((grade) => (
                                    <span key={grade.id} className={getGradePillClassName(grade)}>
                                      {sanitizeJournalScoreText(grade.scoreRaw)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="journal-empty-mark">-</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="journal-grade-grid">
                                {row.soch.length > 0 ? (
                                  row.soch.map((grade) => (
                                    <span key={grade.id} className={getGradePillClassName(grade)}>
                                      {sanitizeJournalScoreText(grade.scoreRaw)}
                                    </span>
                                  ))
                                ) : (
                                  <span className="journal-empty-mark">-</span>
                                )}
                              </div>
                            </td>
                            <td>
                              {hasVisibleScore(row.finalMark) ? (
                                <span className={getFinalMarkPillClassName(sanitizeJournalScoreText(row.finalMark ?? ""))}>
                                  {sanitizeJournalScoreText(row.finalMark ?? "")}
                                </span>
                              ) : (
                                <span className="journal-empty-mark">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6}>{t("none_data")}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Section>

            <Section title={t("performance")}>
              <div className="chip-row history-subject-picker" role="group" aria-label={t("subject")}>
                <button
                  className={selectedHistorySubjects.length === 0 ? "chip-button active" : "chip-button"}
                  type="button"
                  onClick={() => setSelectedHistorySubjects([])}
                >
                  {t("all_subjects")}
                </button>

                {historySubjectOptions.map((subject) => {
                  const isActive = selectedHistorySubjects.includes(subject);
                  const maxReached = selectedHistorySubjects.length >= 3;
                  return (
                    <button
                      key={subject}
                      className={isActive ? "chip-button active" : "chip-button"}
                      type="button"
                      onClick={() => handleHistorySubjectToggle(subject)}
                      disabled={!isActive && maxReached}
                      title={subject}
                    >
                      {subject}
                    </button>
                  );
                })}

                <span className="chip">{selectedHistorySubjects.length}/3</span>
              </div>

              <StudentHistoryChart progress={historyChartProgress} scoreLabel={t("score")} />
            </Section>

            <Section title={t("all_subjects")}>
              <MetricBarChart
                data={studentSubjects.map((subject) => ({
                  label: subject.subject,
                  value: subject.current,
                  tone: subject.risk ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("score")}
              />
            </Section>

            <Section title={t("table_grades")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("subject")}</th>
                    <th>{t("score")}</th>
                    <th>{t("trend")}</th>
                    <th>{t("status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {studentSubjects.map((subject) => (
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
            </Section>
          </>
        ) : null}

        {data && "classes" in data ? (
          <>
            <Section title={t("progress_by_classes")}>
              <MetricBarChart
                data={data.classes.map((item) => ({
                  label: item.classId,
                  value: item.averageScore,
                  tone: item.riskStudents.length > 0 ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("score")}
              />
            </Section>

            <Section title={t("progress_by_classes")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("class")}</th>
                    <th>{t("score")}</th>
                    <th>{t("in_zone_risk")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.classes.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>{item.averageScore.toFixed(1)}</td>
                      <td>{item.riskStudents.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </>
        ) : null}

        {data && "byClass" in data ? (
          <>
            <Section title={t("comparison_classes")}>
              <MetricBarChart
                data={data.byClass.map((item) => ({
                  label: item.classId,
                  value: item.avgScore,
                  tone: item.riskStudents.length > 0 ? ("warn" as const) : undefined,
                }))}
                valueLabel={t("score")}
              />
            </Section>

            <Section title={t("comparison_classes")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t("class")}</th>
                    <th>{t("teacher")}</th>
                    <th>{t("score")}</th>
                    <th>{t("risk_students")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byClass.map((item) => (
                    <tr key={item.classId}>
                      <td>{item.classId}</td>
                      <td>{item.teacherId}</td>
                      <td>{item.avgScore.toFixed(1)}</td>
                      <td>{item.riskStudents.length}</td>
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
