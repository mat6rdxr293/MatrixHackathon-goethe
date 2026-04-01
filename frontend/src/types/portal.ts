export type Role = "student" | "teacher" | "parent" | "admin";
export type Lang = "ru" | "kk";

export type EventType = "news" | "event" | "announcement";
export type AchievementType = "academic" | "sport" | "creative" | "social";

export type SafeUser = {
  id: string;
  role: Role;
  email: string;
  name: string;
  classId?: string;
  linkedStudentId?: string;
  bilimLinked?: boolean;
  bilimLogin?: string;
  bilimLinkedAt?: string;
  bilimSchoolId?: number;
  bilimGroupId?: number;
  bilimEduYear?: number;
  bilimPeriod?: number;
  bilimPeriodType?: string;
};

export type Achievement = {
  id: string;
  studentId: string;
  title: string;
  type: AchievementType;
  badge: string;
  date: string;
  points: number;
  proofUrl?: string;
  proofNote?: string;
  proofAttachment?: {
    fileName: string;
    mimeType: string;
    dataUrl: string;
  };
  submittedBy?: string;
  submittedAt?: string;
  verification?: {
    status: "verified" | "pending";
    verifiedAt?: string;
    verifiedBy?: string;
    method?: string;
    evidence?: string;
  };
};

export type EventItem = {
  id: string;
  type: EventType;
  title: string;
  description: string;
  date: string;
  important?: boolean;
  targetRoles?: Role[];
  targetClassIds?: string[];
};

export type RiskStudent = {
  studentId: string;
  name: string;
};

export type ClassSummary = {
  classId: string;
  averageScore: number;
  riskStudents: RiskStudent[];
};

export type SubjectPoint = {
  date: string;
  score: number;
};

export type SubjectProgress = {
  subject: string;
  current: number;
  trend: number;
  risk: boolean;
  history: SubjectPoint[];
};

export type StudentProfile = {
  studentId: string;
  fullName: string;
  classId: string;
  averageScore: number;
  weakSubjects: string[];
  progress: SubjectProgress[];
};

export type StudentDashboard = {
  role: "student";
  greeting: string;
  averageScore: number;
  periodDelta: number;
  weakSubjects: string[];
  achievements: Achievement[];
  events: EventItem[];
  aiRecommendation: string;
  quickActions: string[];
};

export type TeacherDashboard = {
  role: "teacher";
  classes: ClassSummary[];
  averageByClass: { classId: string; averageScore: number }[];
  riskStudents: RiskStudent[];
  studentAchievements: Achievement[];
  events: EventItem[];
  aiSummary: string;
  teacherEfficiency?: {
    weeklyHoursSaved: number;
    automatedActions: number;
    recommendedActions: number;
    focusClasses: string[];
  };
};

export type ParentDashboard = {
  role: "parent";
  child: string;
  averageScore: number;
  dynamicTrend: { subject: string; current: number; trend: number }[];
  achievements: Achievement[];
  events: EventItem[];
  aiSummary: string;
  weeklySummary?: {
    periodLabel: string;
    delta: number;
    wins: string[];
    risks: string[];
    plan: string[];
  };
};

export type AdminDashboard = {
  role: "admin";
  schoolAverage: number;
  topClasses: string[];
  riskyClasses: string[];
  totalEvents: number;
  newAchievements: number;
  quickLinks: { id: string; title: string; href: string }[];
};

export type DashboardResponse =
  | StudentDashboard
  | TeacherDashboard
  | ParentDashboard
  | AdminDashboard;

export type StudentProgressResponse = {
  role: "student" | "parent";
  student: StudentProfile | null;
  periodSwitch: string[];
};

export type TeacherProgressResponse = {
  role: "teacher";
  classes: ClassSummary[];
};

export type AdminProgressResponse = {
  role: "admin";
  byClass: { classId: string; teacherId: string; avgScore: number; riskStudents: string[] }[];
};

export type ProgressResponse =
  | StudentProgressResponse
  | TeacherProgressResponse
  | AdminProgressResponse;

export type AchievementsResponse = {
  role: Role;
  items: Achievement[];
  leaderboard: { rank: number; studentId: string; name: string; averageScore: number }[];
};

export type EventsResponse = {
  feed: EventItem[];
  upcoming: EventItem[];
};

export type AiMentorResponse = {
  role: Role;
  summary: string;
  strengths?: string[];
  weaknesses?: string[];
  strongSides?: string[];
  weakSides?: string[];
  recommendations: string[];
  trends?: { subject: string; trend: number }[];
  mode?: "openai" | "local" | "demo";
  explainability?: {
    confidence: number;
    drivers: string[];
    source: string;
  };
};

export type AdminAnalyticsResponse = {
  schoolAverage: number;
  classComparison: { classId: string; teacherId: string; avgScore: number; riskStudents: string[] }[];
  totalUsers: number;
  eventsCount: number;
  achievementsCount: number;
  riskStudents: number;
};

export type AdminUsersResponse = {
  roles: Role[];
  users: SafeUser[];
};

export type AdminClassItem = {
  classId: string;
  teacherId: string | null;
  avgScore: number;
  riskStudents: number;
  studentsCount: number;
};

export type AdminClassesResponse = {
  items: AdminClassItem[];
};

export type IntegrationStatus = {
  provider: string;
  mode: string;
  configured: boolean;
  liveEnabled?: boolean;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

export type BilimSyncResponse = {
  students: StudentProfile[];
};

export type KioskResponse = {
  fullscreenHero: {
    title: string;
    subtitle: string;
  };
  achievements: Achievement[];
  news: EventItem[];
  upcomingEvents: EventItem[];
  topStudents: { rank: number; studentId: string; name: string; averageScore: number }[];
  schoolHighlights: string[];
  scheduleUpdates?: ScheduleEntry[];
};

export type NotificationItem = {
  id: string;
  type: "system" | "schedule" | "event" | "achievement";
  title: string;
  message: string;
  createdAt: string;
  targetRoles?: Role[];
  targetClassIds?: string[];
};

export type NotificationsResponse = {
  items: NotificationItem[];
};

export type ScheduleEntry = {
  id: string;
  classId: string;
  day: number;
  slot: number;
  duration: number;
  subject: string;
  teacherId: string;
  room: string;
  kind: "lesson" | "pair" | "academic-hour" | "stream" | "event";
  groupName?: string;
  streamId?: string;
  status: "planned" | "changed" | "cancelled";
  createdAt: string;
  updatedAt: string;
};

export type ScheduleResponse = {
  items: ScheduleEntry[];
};

export type TeacherAbsenceItem = {
  id: string;
  teacherId: string;
  day: number;
  slot: number;
  date: string;
  reason?: string;
  createdAt: string;
};

export type AdminScheduleResponse = {
  items: ScheduleEntry[];
  absences: TeacherAbsenceItem[];
};

export type StudentPredictionResponse = {
  role: "student" | "parent";
  prediction: {
    studentId: string;
    fullName: string;
    classId: string;
    overallRisk: number;
    flags: string[];
    topRiskMessage: string;
    nextActions: string[];
    subjects: {
      subject: string;
      probability: number;
      reason: string;
      resources: string[];
    }[];
  } | null;
};

export type TeacherPredictionResponse = {
  role: "teacher";
  classes: string[];
  students: {
    studentId: string;
    fullName: string;
    classId: string;
    overallRisk: number;
    weakSubject: string;
    probability: number;
  }[];
};

export type AdminPredictionResponse = {
  role: "admin";
  classRadar: {
    classId: string;
    averageRisk: number;
    highRiskStudents: number;
    totalStudents: number;
  }[];
};

export type PredictionsResponse =
  | StudentPredictionResponse
  | TeacherPredictionResponse
  | AdminPredictionResponse;

export type ClassReportResponse = {
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

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiChatResponse = {
  reply: string;
  source: "openai" | "local" | "demo";
  mode?: "openai" | "local" | "demo";
};

export type AiChatRequest = {
  message: string;
  history?: AiChatMessage[];
  context?: {
    mentorSummary?: string;
    predictionsSummary?: string;
    recommendationHints?: string[];
    analytics?: {
      strengths?: string[];
      weaknesses?: string[];
      recommendations?: string[];
      trends?: { subject: string; trend: number }[];
      prediction?: {
        overallRisk?: number;
        topRiskMessage?: string;
        flags?: string[];
        nextActions?: string[];
      };
      teacherTopRisks?: string[];
      adminTopRiskClasses?: string[];
    };
  };
};

export type AuthContextValue = {
  user: SafeUser | null;
  token: string | null;
  initialized: boolean;
  login: (email: string, password: string, selectedRole: Role) => Promise<void>;
  logout: () => void;
};

export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export type LoginResponse = {
  token: string;
  user: SafeUser;
};

export type ProfileResponse = {
  user: SafeUser;
};

export type BilimBindingStatusResponse = {
  provider: "BilimClass";
  linked: boolean;
  login: string | null;
  linkedAt: string | null;
  schoolId?: number | null;
  groupId?: number | null;
  eduYear?: number | null;
  period?: number | null;
  periodType?: string | null;
};

export type BilimBindingUpdateResponse = BilimBindingStatusResponse & {
  accountName?: string | null;
};

export type StudentProfileCardResponse = {
  student: StudentProfile;
  rank: number | null;
  points: number;
  attendancePercent: number;
  streakDays: number;
  recentGrades: {
    subject: string;
    score: number;
    date: string;
  }[];
  achievements: Achievement[];
  ai: {
    summary: string;
    riskLabel: string;
    action: string;
    opportunity: string;
  };
};

