import { StudentProfile } from "../types";
import { openAiMentorService } from "./openAiMentorService";
import { studentPrediction } from "./riskEngineService";

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

    const predictions = classProfiles
      .map((item) => studentPrediction(item))
      .sort((a, b) => b.overallRisk - a.overallRisk);

    const summary = {
      students: classProfiles.length,
      averageScore:
        classProfiles.reduce((sum, item) => sum + item.averageScore, 0) / classProfiles.length,
      highRiskStudents: predictions.filter((item) => item.overallRisk >= 70).length,
    };

    const atRiskStudents = predictions.slice(0, 6).map((item) => ({
      studentId: item.studentId,
      name: item.fullName,
      overallRisk: item.overallRisk,
      weakSubject: item.subjects[0]?.subject ?? "-",
      probability: item.subjects[0]?.probability ?? item.overallRisk,
    }));

    const topRisks = atRiskStudents.slice(0, 4).map((item) => ({
      student: item.name,
      subject: item.weakSubject,
      probability: item.probability,
    }));

    const reportText = await openAiMentorService.generateClassReport({
      teacherName,
      classId,
      summary: {
        students: summary.students,
        averageScore: Number(summary.averageScore.toFixed(2)),
        highRisk: summary.highRiskStudents,
      },
      topRisks,
    });

    const recommendations = predictions
      .flatMap((item) => item.subjects.slice(0, 1).flatMap((subject) => subject.resources))
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 4);

    return {
      classId,
      generatedAt: new Date().toISOString(),
      summary: {
        students: summary.students,
        averageScore: Number(summary.averageScore.toFixed(2)),
        highRiskStudents: summary.highRiskStudents,
      },
      atRiskStudents,
      reportText,
      recommendations,
    } satisfies ClassReport;
  },
};
