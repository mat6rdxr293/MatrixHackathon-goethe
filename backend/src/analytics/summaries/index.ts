import { Role } from "../../types";
import { roundTo } from "../../utils/scoringHelpers";
import { StudentRiskResult } from "../types";

export const aggregateClassRisk = (classId: string, students: StudentRiskResult[]) => {
  const total = students.length;
  const averageRisk = total > 0 ? roundTo(students.reduce((sum, item) => sum + item.riskScore, 0) / total) : 0;
  const highRiskStudents = students.filter((item) => item.riskLevel === "high").length;
  const mediumRiskStudents = students.filter((item) => item.riskLevel === "medium").length;
  return {
    classId,
    students: total,
    averageRisk,
    highRiskStudents,
    mediumRiskStudents,
  };
};

export const aggregateSchoolRisk = (students: StudentRiskResult[]) => {
  const byClass = new Map<string, StudentRiskResult[]>();
  for (const student of students) {
    const list = byClass.get(student.classId) ?? [];
    list.push(student);
    byClass.set(student.classId, list);
  }
  const classes = [...byClass.entries()].map(([classId, classStudents]) => aggregateClassRisk(classId, classStudents));
  return {
    students: students.length,
    classes: classes.length,
    schoolRiskAverage:
      students.length > 0 ? roundTo(students.reduce((sum, item) => sum + item.riskScore, 0) / students.length) : 0,
    highRiskStudents: students.filter((item) => item.riskLevel === "high").length,
    classBreakdown: classes.sort((a, b) => b.averageRisk - a.averageRisk),
  };
};

export const buildExplainabilityDrivers = (
  role: Role,
  riskResults: StudentRiskResult[],
  extraDrivers: string[] = [],
) => {
  const topReasons = new Map<string, number>();
  for (const result of riskResults) {
    for (const reason of result.reasons) {
      topReasons.set(reason, (topReasons.get(reason) ?? 0) + 1);
    }
  }
  const rankedReasons = [...topReasons.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason]) => reason);

  const source = role === "teacher" ? "class-aggregates" : role === "admin" ? "school-aggregates" : "student-profile";
  const confidence = Math.max(
    58,
    Math.min(
      96,
      Math.round(
        60 +
          riskResults.length * 1.5 +
          riskResults.filter((item) => item.reasonDetails.length > 0).length * 3 +
          rankedReasons.length * 2,
      ),
    ),
  );

  const combinedDrivers = [
    "Rule-based аналитика: скоринг и причины считаются локально (без LLM).",
    ...rankedReasons,
    ...extraDrivers,
  ].filter((item, index, array) => array.indexOf(item) === index);

  return {
    confidence,
    drivers: combinedDrivers.slice(0, 7),
    source,
  };
};

