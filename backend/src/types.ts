export type Role = "student" | "teacher" | "parent" | "admin";

export type User = {
  id: string;
  role: Role;
  email: string;
  password: string;
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

export type GradePoint = {
  date: string;
  score: number;
};

export type SubjectProgress = {
  subject: string;
  current: number;
  trend: number;
  risk: boolean;
  history: GradePoint[];
};

export type StudentProfile = {
  studentId: string;
  fullName: string;
  classId: string;
  averageScore: number;
  weakSubjects: string[];
  progress: SubjectProgress[];
};

export type Achievement = {
  id: string;
  studentId: string;
  title: string;
  type: "academic" | "sport" | "creative" | "social";
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
  type: "news" | "event" | "announcement";
  title: string;
  description: string;
  date: string;
  important?: boolean;
  targetRoles?: Role[];
  targetClassIds?: string[];
};

export type ClassOverview = {
  classId: string;
  teacherId: string;
  avgScore: number;
  riskStudents: string[];
};

export type ManagedClass = {
  id: string;
  classId: string;
  teacherId: string | null;
  createdAt: string;
};

export type NotificationItem = {
  id: string;
  type: "system" | "schedule" | "event" | "achievement";
  title: string;
  message: string;
  createdAt: string;
  targetRoles?: Role[];
  targetClassIds?: string[];
  meta?: Record<string, unknown>;
};

export type ScheduleKind = "lesson" | "pair" | "academic-hour" | "stream" | "event";
export type ScheduleStatus = "planned" | "changed" | "cancelled";

export type ScheduleEntry = {
  id: string;
  classId: string;
  day: number;
  slot: number;
  duration: number;
  subject: string;
  teacherId: string;
  room: string;
  kind: ScheduleKind;
  groupName?: string;
  streamId?: string;
  status: ScheduleStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeacherAbsence = {
  id: string;
  teacherId: string;
  day: number;
  slot: number;
  date: string;
  reason?: string;
  createdAt: string;
};
