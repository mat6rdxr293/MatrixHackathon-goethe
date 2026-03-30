"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classRiskRadar = exports.studentPrediction = exports.subjectRiskProbability = void 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const resourceMap = {
    алгебр: [
        "BilimClass: раздел «Уравнения и неравенства»",
        "BilimClass: тренажер по линейным функциям",
        "Школьный разбор: 20 задач перед СОЧ",
    ],
    физ: [
        "BilimClass: краткий курс по механике",
        "BilimClass: модуль «Силы и движение»",
        "Школьный разбор типовых задач по кинематике",
    ],
    истор: [
        "BilimClass: даты и причинно-следственные связи",
        "Карточки по темам недели",
        "Короткий обзор исторических карт за 15 минут",
    ],
    англ: [
        "BilimClass: грамматика по темам недели",
        "BilimClass: задания на говорение",
        "Подборка слов по текущим темам",
    ],
    литератур: [
        "BilimClass: анализ текста по плану",
        "Короткий конспект по произведению",
        "Список вопросов для самопроверки",
    ],
};
const resolveResources = (subject) => {
    const normalized = subject.toLowerCase();
    const key = Object.keys(resourceMap).find((item) => normalized.includes(item));
    if (!key) {
        return [
            "BilimClass: повтор по теме недели",
            "Короткая консультация с учителем",
            "Тренажер с 15 задачами в день",
        ];
    }
    return resourceMap[key];
};
const dropInLastThree = (history) => {
    if (history.length < 3) {
        return 0;
    }
    const last = history.slice(-3).map((item) => item.score);
    return Number((last[2] - last[0]).toFixed(2));
};
const subjectRiskProbability = (item) => {
    const lastDrop = dropInLastThree(item.history);
    let riskScore = 0;
    if (item.current < 3.5) {
        riskScore += 45;
    }
    else if (item.current < 4) {
        riskScore += 30;
    }
    else if (item.current < 4.5) {
        riskScore += 15;
    }
    if (item.trend < -0.4) {
        riskScore += 25;
    }
    else if (item.trend < -0.2) {
        riskScore += 15;
    }
    else if (item.trend < 0) {
        riskScore += 8;
    }
    if (lastDrop < -0.5) {
        riskScore += 18;
    }
    else if (lastDrop < -0.2) {
        riskScore += 10;
    }
    if (item.risk) {
        riskScore += 12;
    }
    const probability = clamp(Math.round(riskScore + 10), 8, 97);
    const reasonParts = [
        `Текущий балл: ${item.current.toFixed(1)}`,
        `Тренд: ${item.trend > 0 ? "+" : ""}${item.trend.toFixed(1)}`,
    ];
    if (lastDrop < -0.2) {
        reasonParts.push("Есть падение в последних оценках");
    }
    return {
        subject: item.subject,
        probability,
        reason: reasonParts.join(". "),
        resources: resolveResources(item.subject),
    };
};
exports.subjectRiskProbability = subjectRiskProbability;
const studentPrediction = (profile) => {
    const subjects = profile.progress
        .map(exports.subjectRiskProbability)
        .sort((a, b) => b.probability - a.probability);
    const topThree = subjects.slice(0, 3);
    const overall = topThree.length > 0
        ? Math.round(topThree.reduce((sum, item) => sum + item.probability, 0) / topThree.length)
        : 0;
    const flags = [];
    if (profile.weakSubjects.length >= 2) {
        flags.push("Несколько предметов в зоне риска");
    }
    if (topThree.some((item) => item.probability >= 75)) {
        flags.push("Высокая вероятность сложностей на ближайшем контроле");
    }
    if (profile.averageScore < 4) {
        flags.push("Средний балл ниже целевого уровня");
    }
    return {
        studentId: profile.studentId,
        fullName: profile.fullName,
        classId: profile.classId,
        overallRisk: clamp(overall, 5, 98),
        flags,
        subjects,
    };
};
exports.studentPrediction = studentPrediction;
const classRiskRadar = (profiles) => {
    const byClass = new Map();
    for (const profile of profiles) {
        const prediction = (0, exports.studentPrediction)(profile);
        const list = byClass.get(profile.classId) ?? [];
        list.push(prediction);
        byClass.set(profile.classId, list);
    }
    return [...byClass.entries()]
        .map(([classId, items]) => {
        const avgRisk = items.reduce((sum, item) => sum + item.overallRisk, 0) / items.length;
        const highRisk = items.filter((item) => item.overallRisk >= 70).length;
        return {
            classId,
            averageRisk: Number(avgRisk.toFixed(1)),
            highRiskStudents: highRisk,
            totalStudents: items.length,
        };
    })
        .sort((a, b) => b.averageRisk - a.averageRisk);
};
exports.classRiskRadar = classRiskRadar;
