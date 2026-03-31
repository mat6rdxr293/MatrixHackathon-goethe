import { Role, ScheduleEntry, StudentProfile } from "../../types";

export type AnalysisPreset = "balanced" | "risk" | "comfort";

export type StudentRiskWeights = {
  averageScore: number;
  scoreDrop: number;
  attendance: number;
  instability: number;
  overdueTasks: number;
  weakSubjectLoad: number;
};

export type ScheduleRiskWeights = {
  classGaps: number;
  teacherGaps: number;
  overloadedDays: number;
  lateLessons: number;
  unevenLoad: number;
  teacherConflicts: number;
  roomConflicts: number;
  unscheduledPenalty: number;
};

export type AnalysisPresetWeights = {
  risk: StudentRiskWeights;
  schedule: ScheduleRiskWeights;
};

export type StudentAnalyticsInput = {
  profile: StudentProfile;
  analysisPreset?: AnalysisPreset;
  attendanceRate?: number;
  missedLessons?: number;
  overdueTasks?: number;
};

export type StudentRiskReasonCode =
  | "low_average_score"
  | "sharp_score_drop"
  | "unstable_results"
  | "frequent_absences"
  | "overdue_tasks"
  | "weak_key_subject";

export type StudentRiskReason = {
  code: StudentRiskReasonCode;
  text: string;
  severity: "low" | "medium" | "high";
};

export type StudentRiskLevel = "low" | "medium" | "high";

export type StudentSubjectInsight = {
  subject: string;
  current: number;
  trend: number;
  riskScore: number;
};

export type StudentRiskResult = {
  studentId: string;
  fullName: string;
  classId: string;
  riskLevel: StudentRiskLevel;
  riskScore: number;
  reasons: string[];
  reasonDetails: StudentRiskReason[];
  strongestSubjects: string[];
  weakestSubjects: string[];
  trend: {
    direction: "up" | "down" | "flat";
    value: number;
  };
  recommendationsSeed: string[];
  recommendationContext: {
    averageScore: number;
    attendanceRate: number;
    missedLessons: number;
    overdueTasks: number;
    weakSubjects: string[];
    subjectInsights: StudentSubjectInsight[];
    preset: AnalysisPreset;
  };
};

export type StudentPerformanceSummary = {
  basePerformance: "high" | "medium" | "low";
  averageScore: number;
  trendValue: number;
  trendDirection: "up" | "down" | "flat";
  weakSubjects: string[];
  strongestSubjects: string[];
  nextActions: string[];
};

export type TeacherClassSummaryInput = {
  classId: string;
  students: number;
  averageScore: number;
  highRiskStudents: number;
  topRiskReasons: string[];
  strongestSubjects: string[];
  weakestSubjects: string[];
  recommendationsSeed: string[];
};

export type ParentSummaryInput = {
  childName: string;
  riskLevel: StudentRiskLevel;
  riskScore: number;
  trendDirection: "up" | "down" | "flat";
  wins: string[];
  risks: string[];
  weeklyPlan: string[];
};

export type ScheduleAnalyticsInput = {
  entries: ScheduleEntry[];
  days: number[];
  slotsPerDay: number;
  unscheduledCount?: number;
  analysisPreset?: AnalysisPreset;
};

export type ScheduleIssue = {
  code:
    | "class_gaps"
    | "teacher_gaps"
    | "overloaded_days"
    | "late_lessons"
    | "uneven_load"
    | "teacher_conflicts"
    | "room_conflicts"
    | "unscheduled";
  text: string;
  severity: "low" | "medium" | "high";
  value: number;
};

export type ScheduleQualityLevel = "excellent" | "good" | "needs_attention" | "critical";

export type ScheduleEvaluationResult = {
  score: number;
  severity: "low" | "medium" | "high";
  qualityLevel: ScheduleQualityLevel;
  foundIssues: string[];
  strengths: string[];
  issues: ScheduleIssue[];
  metrics: {
    classGapAvg: number;
    teacherGapAvg: number;
    overloadedDayRate: number;
    lateLessonShare: number;
    unevenLoadScore: number;
    teacherConflicts: number;
    roomConflicts: number;
    unscheduledCount: number;
    classCount: number;
    teacherCount: number;
    totalLessons: number;
  };
};

export type StructuredSummaryKind =
  | "student-mentor"
  | "parent-weekly-summary"
  | "teacher-class-report"
  | "admin-school-summary"
  | "schedule-quality";

export type StructuredSummaryPayload = {
  role: Role;
  kind: StructuredSummaryKind;
  structuredData: Record<string, unknown>;
  fallbackSummary: string;
  fallbackRecommendations: string[];
};

export type StructuredSummaryResult = {
  summary: string;
  recommendations: string[];
  source: "openai" | "local" | "demo";
};

