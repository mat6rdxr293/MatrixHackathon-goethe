import { User } from "../types";
import { calculateStudentRisk } from "../analytics/risk/studentRisk";
import { aggregateSchoolRisk } from "../analytics/summaries";
import { bilimClassService } from "./bilimClassService";
import { storageService } from "./storageService";

type SafeUser = Omit<User, "password">;

const getLinkedProfile = async (user: SafeUser) => {
  const profiles = await bilimClassService.getStudentProfiles();
  if (user.role === "student") {
    const id = user.linkedStudentId ?? user.id;
    return profiles.find((item) => item.studentId === id) ?? null;
  }
  if (user.role === "parent") {
    if (!user.linkedStudentId) {
      return null;
    }
    return profiles.find((item) => item.studentId === user.linkedStudentId) ?? null;
  }
  return null;
};

export const predictionService = {
  async getPredictionsByRole(user: SafeUser) {
    const profiles = await bilimClassService.getStudentProfiles();

    if (user.role === "student" || user.role === "parent") {
      const linked = await getLinkedProfile(user);
      if (!linked) {
        return {
          role: user.role,
          prediction: null,
        };
      }

      const prediction = calculateStudentRisk({
        profile: linked,
        analysisPreset: "risk",
      });
      const topInsights = prediction.recommendationContext.subjectInsights.slice(0, 3);

      return {
        role: user.role,
        prediction: {
          studentId: prediction.studentId,
          fullName: prediction.fullName,
          classId: prediction.classId,
          overallRisk: prediction.riskScore,
          flags: prediction.reasons,
          topRiskMessage:
            topInsights.length > 0
              ? `Риск по предмету "${topInsights[0].subject}" выше остальных: ${Math.round(topInsights[0].riskScore)}%.`
              : "Выраженных рисков по предметам не обнаружено.",
          nextActions: prediction.recommendationsSeed.slice(0, 3),
          subjects: topInsights.map((item) => ({
            subject: item.subject,
            probability: Math.round(item.riskScore),
            reason:
              prediction.reasonDetails.find(
                (reason) =>
                  reason.code === "weak_key_subject" &&
                  reason.text.toLowerCase().includes(item.subject.toLowerCase()),
              )?.text ?? `Текущий балл: ${item.current.toFixed(1)}, тренд: ${item.trend.toFixed(2)}`,
            resources: prediction.recommendationsSeed.slice(0, 3),
          })),
        },
      };
    }

    if (user.role === "teacher") {
      const teacherClasses = storageService
        .listClasses()
        .filter((item) => item.teacherId === user.id)
        .map((item) => item.classId);

      const classProfiles = profiles.filter((item) => teacherClasses.includes(item.classId));
      const predictions = classProfiles.map((item) =>
        calculateStudentRisk({
          profile: item,
          analysisPreset: "risk",
        }),
      );

      return {
        role: user.role,
        classes: teacherClasses,
        students: predictions
          .sort((a, b) => b.riskScore - a.riskScore)
          .map((item) => ({
            studentId: item.studentId,
            fullName: item.fullName,
            classId: item.classId,
            overallRisk: item.riskScore,
            weakSubject: item.weakestSubjects[0] ?? "-",
            probability: item.riskScore,
          })),
      };
    }

    const schoolAggregate = aggregateSchoolRisk(
      profiles.map((profile) =>
        calculateStudentRisk({
          profile,
          analysisPreset: "risk",
        }),
      ),
    );

    return {
      role: user.role,
      classRadar: schoolAggregate.classBreakdown.map((item) => ({
        classId: item.classId,
        averageRisk: item.averageRisk,
        highRiskStudents: item.highRiskStudents,
        totalStudents: item.students,
      })),
    };
  },
};

