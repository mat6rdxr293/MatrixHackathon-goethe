"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.predictionService = void 0;
const studentRisk_1 = require("../analytics/risk/studentRisk");
const summaries_1 = require("../analytics/summaries");
const bilimClassService_1 = require("./bilimClassService");
const storageService_1 = require("./storageService");
const getLinkedProfile = async (user) => {
    const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
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
exports.predictionService = {
    async getPredictionsByRole(user) {
        const profiles = await bilimClassService_1.bilimClassService.getStudentProfiles();
        if (user.role === "student" || user.role === "parent") {
            const linked = await getLinkedProfile(user);
            if (!linked) {
                return {
                    role: user.role,
                    prediction: null,
                };
            }
            const prediction = (0, studentRisk_1.calculateStudentRisk)({
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
                    topRiskMessage: topInsights.length > 0
                        ? `Риск по предмету "${topInsights[0].subject}" выше остальных: ${Math.round(topInsights[0].riskScore)}%.`
                        : "Выраженных рисков по предметам не обнаружено.",
                    nextActions: prediction.recommendationsSeed.slice(0, 3),
                    subjects: topInsights.map((item) => ({
                        subject: item.subject,
                        probability: Math.round(item.riskScore),
                        reason: prediction.reasonDetails.find((reason) => reason.code === "weak_key_subject" &&
                            reason.text.toLowerCase().includes(item.subject.toLowerCase()))?.text ?? `Текущий балл: ${item.current.toFixed(1)}, тренд: ${item.trend.toFixed(2)}`,
                        resources: prediction.recommendationsSeed.slice(0, 3),
                    })),
                },
            };
        }
        if (user.role === "teacher") {
            const teacherClasses = storageService_1.storageService
                .listClasses()
                .filter((item) => item.teacherId === user.id)
                .map((item) => item.classId);
            const classProfiles = profiles.filter((item) => teacherClasses.includes(item.classId));
            const predictions = classProfiles.map((item) => (0, studentRisk_1.calculateStudentRisk)({
                profile: item,
                analysisPreset: "risk",
            }));
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
        const schoolAggregate = (0, summaries_1.aggregateSchoolRisk)(profiles.map((profile) => (0, studentRisk_1.calculateStudentRisk)({
            profile,
            analysisPreset: "risk",
        })));
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
