"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminsQuickLinks = exports.events = exports.achievements = exports.classOverviews = exports.students = exports.users = exports.portalName = void 0;
exports.portalName = "Портал Aqbobek Lyceum";
exports.users = [
    {
        id: "stu-1",
        role: "student",
        email: "student@aqbobek.edu",
        password: "student123",
        name: "Aruzhan Nurtayeva",
        classId: "10A",
    },
    {
        id: "stu-2",
        role: "student",
        email: "student2@aqbobek.edu",
        password: "student123",
        name: "Nursultan Bek",
        classId: "10A",
    },
    {
        id: "teacher-1",
        role: "teacher",
        email: "teacher@aqbobek.edu",
        password: "teacher123",
        name: "Dana Utepova",
        classId: "10A",
    },
    {
        id: "parent-1",
        role: "parent",
        email: "parent@aqbobek.edu",
        password: "parent123",
        name: "Gulmira Nurtayeva",
        linkedStudentId: "stu-1",
    },
    {
        id: "admin-1",
        role: "admin",
        email: "admin@aqbobek.edu",
        password: "admin123",
        name: "Erzhan Tursyn",
    },
];
exports.students = [
    {
        studentId: "stu-1",
        fullName: "Aruzhan Nurtayeva",
        classId: "10A",
        averageScore: 4.5,
        weakSubjects: ["Физика", "Алгебра"],
        progress: [
            {
                subject: "Алгебра",
                current: 4.2,
                trend: -0.2,
                risk: true,
                history: [
                    { date: "2026-01-10", score: 4.4 },
                    { date: "2026-02-10", score: 4.3 },
                    { date: "2026-03-10", score: 4.2 },
                ],
            },
            {
                subject: "Физика",
                current: 3.9,
                trend: -0.4,
                risk: true,
                history: [
                    { date: "2026-01-10", score: 4.4 },
                    { date: "2026-02-10", score: 4.1 },
                    { date: "2026-03-10", score: 3.9 },
                ],
            },
            {
                subject: "Английский язык",
                current: 4.8,
                trend: 0.3,
                risk: false,
                history: [
                    { date: "2026-01-10", score: 4.4 },
                    { date: "2026-02-10", score: 4.6 },
                    { date: "2026-03-10", score: 4.8 },
                ],
            },
        ],
    },
    {
        studentId: "stu-2",
        fullName: "Nursultan Bek",
        classId: "10A",
        averageScore: 4.1,
        weakSubjects: ["Казахская литература"],
        progress: [
            {
                subject: "Алгебра",
                current: 4.0,
                trend: 0.1,
                risk: false,
                history: [
                    { date: "2026-01-10", score: 3.9 },
                    { date: "2026-02-10", score: 4.0 },
                    { date: "2026-03-10", score: 4.0 },
                ],
            },
            {
                subject: "Казахская литература",
                current: 3.5,
                trend: -0.2,
                risk: true,
                history: [
                    { date: "2026-01-10", score: 3.8 },
                    { date: "2026-02-10", score: 3.6 },
                    { date: "2026-03-10", score: 3.5 },
                ],
            },
            {
                subject: "Английский язык",
                current: 4.9,
                trend: 0.4,
                risk: false,
                history: [
                    { date: "2026-01-10", score: 4.1 },
                    { date: "2026-02-10", score: 4.6 },
                    { date: "2026-03-10", score: 4.9 },
                ],
            },
        ],
    },
];
exports.classOverviews = [
    {
        classId: "10A",
        teacherId: "teacher-1",
        avgScore: 4.3,
        riskStudents: ["stu-1", "stu-2"],
    },
    {
        classId: "9B",
        teacherId: "teacher-1",
        avgScore: 4.6,
        riskStudents: [],
    },
];
exports.achievements = [
    {
        id: "ach-1",
        studentId: "stu-1",
        title: "Финалист олимпиады по математике",
        type: "academic",
        badge: "Звезда учебы",
        date: "2026-03-15",
        points: 95,
    },
    {
        id: "ach-2",
        studentId: "stu-1",
        title: "Лучший спикер дебатов",
        type: "social",
        badge: "Оратор",
        date: "2026-02-12",
        points: 88,
    },
    {
        id: "ach-3",
        studentId: "stu-2",
        title: "Победитель регионального футбольного турнира",
        type: "sport",
        badge: "Чемпион",
        date: "2026-03-03",
        points: 92,
    },
];
exports.events = [
    {
        id: "evt-1",
        type: "news",
        title: "В лицее стартует неделя науки и технологий",
        description: "Неделя лабораторий, робототехники и защиты ученических проектов.",
        date: "2026-04-02",
        important: true,
    },
    {
        id: "evt-2",
        type: "event",
        title: "Открытый диалог с родителями",
        description: "Личные встречи по прогрессу учеников и планам поддержки.",
        date: "2026-04-05",
    },
    {
        id: "evt-3",
        type: "announcement",
        title: "Запущена школьная стенгазета",
        description: "На экране в холле теперь показываются достижения и ближайшие события.",
        date: "2026-03-30",
        important: true,
    },
];
exports.adminsQuickLinks = [
    { id: "q-1", title: "Добавить новость", href: "/admin/content" },
    { id: "q-4", title: "Собрать расписание", href: "/admin/schedule" },
    { id: "q-2", title: "Настроить стенгазету", href: "/kiosk" },
    { id: "q-3", title: "Пользователи и роли", href: "/admin/users" },
];
