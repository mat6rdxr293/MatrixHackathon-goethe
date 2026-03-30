import { User } from "../types";
import { bilimClassService } from "./bilimClassService";
import { classRiskRadar, studentPrediction } from "./riskEngineService";
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

      const prediction = studentPrediction(linked);
      const top = prediction.subjects.slice(0, 3);

      return {
        role: user.role,
        prediction: {
          ...prediction,
          topRiskMessage:
            top.length > 0
              ? `Вероятность сложности по предмету ${top[0].subject}: ${top[0].probability}%`
              : "Риск не обнаружен",
          nextActions: top.flatMap((item) => item.resources).slice(0, 3),
        },
      };
    }

    if (user.role === "teacher") {
      const teacherClasses = storageService
        .listClasses()
        .filter((item) => item.teacherId === user.id)
        .map((item) => item.classId);

      const classProfiles = profiles.filter((item) => teacherClasses.includes(item.classId));
      const predictions = classProfiles.map((item) => studentPrediction(item));

      return {
        role: user.role,
        classes: teacherClasses,
        students: predictions
          .sort((a, b) => b.overallRisk - a.overallRisk)
          .map((item) => ({
            studentId: item.studentId,
            fullName: item.fullName,
            classId: item.classId,
            overallRisk: item.overallRisk,
            weakSubject: item.subjects[0]?.subject ?? "-",
            probability: item.subjects[0]?.probability ?? item.overallRisk,
          })),
      };
    }

    return {
      role: user.role,
      classRadar: classRiskRadar(profiles),
    };
  },
};
