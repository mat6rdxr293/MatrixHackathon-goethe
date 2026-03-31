import { AnalysisPreset, AnalysisPresetWeights } from "../types";

const PRESET_WEIGHTS: Record<AnalysisPreset, AnalysisPresetWeights> = {
  balanced: {
    risk: {
      averageScore: 1,
      scoreDrop: 1,
      attendance: 1,
      instability: 1,
      overdueTasks: 1,
      weakSubjectLoad: 1,
    },
    schedule: {
      classGaps: 1,
      teacherGaps: 1,
      overloadedDays: 1,
      lateLessons: 1,
      unevenLoad: 1,
      teacherConflicts: 1,
      roomConflicts: 1,
      unscheduledPenalty: 1,
    },
  },
  risk: {
    risk: {
      averageScore: 1.1,
      scoreDrop: 1.35,
      attendance: 1.4,
      instability: 1.2,
      overdueTasks: 1.15,
      weakSubjectLoad: 1.2,
    },
    schedule: {
      classGaps: 1.2,
      teacherGaps: 1.2,
      overloadedDays: 1.3,
      lateLessons: 1.2,
      unevenLoad: 1,
      teacherConflicts: 1.45,
      roomConflicts: 1.45,
      unscheduledPenalty: 1.3,
    },
  },
  comfort: {
    risk: {
      averageScore: 1,
      scoreDrop: 0.8,
      attendance: 1,
      instability: 0.85,
      overdueTasks: 0.85,
      weakSubjectLoad: 1.15,
    },
    schedule: {
      classGaps: 1.25,
      teacherGaps: 1.05,
      overloadedDays: 1.2,
      lateLessons: 1.25,
      unevenLoad: 1.35,
      teacherConflicts: 1,
      roomConflicts: 1,
      unscheduledPenalty: 1,
    },
  },
};

export const getPresetWeights = (preset: AnalysisPreset = "balanced"): AnalysisPresetWeights =>
  PRESET_WEIGHTS[preset] ?? PRESET_WEIGHTS.balanced;

