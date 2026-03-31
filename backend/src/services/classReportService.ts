import { StudentProfile } from "../types";
import {
  buildTeacherClassSummaryInput,
  calculateStudentRisk,
} from "../analytics/risk/studentRisk";
import { generateLLMSummaryFromStructuredData } from "./llm/llmSummaryService";

export type ClassReport = {
  classId: string;
  generatedAt: string;
  summary: {
    students: number;
    averageScore: number;
    highRiskStudents: number;
  };
  atRiskStudents: {
    studentId: string;
    name: string;
    overallRisk: number;
    weakSubject: string;
    probability: number;
  }[];
  reportText: string;
  recommendations: string[];
};

export const classReportService = {
  async buildClassReport(classId: string, profiles: StudentProfile[], teacherName: string) {
    const classProfiles = profiles.filter((item) => item.classId === classId);
    if (classProfiles.length === 0) {
      return null;
    }

    const analytics = classProfiles
      .map((profile) =>
        calculateStudentRisk({
          profile,
          analysisPreset: "risk",
        }),
      )
      .sort((a, b) => b.riskScore - a.riskScore);

    const classSummaryInput = buildTeacherClassSummaryInput(classId, analytics);

    const atRiskStudents = analytics.slice(0, 6).map((item) => ({
      studentId: item.studentId,
      name: item.fullName,
      overallRisk: item.riskScore,
      weakSubject: item.weakestSubjects[0] ?? "-",
      probability: item.riskScore,
    }));

    const fallbackSummary =
      `Класс ${classId}: ${classSummaryInput.students} учеников, средний балл ${classSummaryInput.averageScore.toFixed(2)}. ` +
      `Учеников с высоким риском: ${classSummaryInput.highRiskStudents}.`;

    const summaryResult = await generateLLMSummaryFromStructuredData({
      role: "teacher",
      kind: "teacher-class-report",
      structuredData: {
        teacherName,
        classId,
        classSummaryInput,
        topRiskStudents: atRiskStudents.slice(0, 4),
      },
      fallbackSummary,
      fallbackRecommendations:
        classSummaryInput.recommendationsSeed.length > 0
          ? classSummaryInput.recommendationsSeed
          : [
              "Сконцентрировать поддержку на 2-3 слабых предметах с самым высоким риском.",
              "Раз в неделю пересчитывать риск и корректировать мини-план работы.",
              "Согласовать с родителями короткий недельный план по ученикам в зоне внимания.",
            ],
    });

    const reportText = [
      summaryResult.summary,
      "",
      "Ключевые причины риска:",
      ...(classSummaryInput.topRiskReasons.length > 0
        ? classSummaryInput.topRiskReasons.map((item, index) => `${index + 1}) ${item}`)
        : ["Критичных причин риска не обнаружено."]),
    ].join("\n");

    return {
      classId,
      generatedAt: new Date().toISOString(),
      summary: {
        students: classSummaryInput.students,
        averageScore: classSummaryInput.averageScore,
        highRiskStudents: classSummaryInput.highRiskStudents,
      },
      atRiskStudents,
      reportText,
      recommendations: summaryResult.recommendations,
    } satisfies ClassReport;
  },
};

