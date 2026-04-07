import type { LocaleKey } from "../contexts/localeTypes";

export type PlannerWeights = {
  classDailyLoad: number;
  teacherDailyLoad: number;
  sameSubjectDay: number;
  classGap: number;
  teacherGap: number;
  lateLessons: number;
  classSpread: number;
  teacherSpread: number;
  centerBias: number;
  adjacentSameSubject: number;
};

export type PlannerPresetId = "balanced" | "risk" | "development";

type PlannerPresetConfig = {
  id: PlannerPresetId;
  titleKey: LocaleKey;
  descriptionKey: LocaleKey;
  weights: PlannerWeights;
};

const defaultPlannerWeights: PlannerWeights = {
  classDailyLoad: 1,
  teacherDailyLoad: 1,
  sameSubjectDay: 1,
  classGap: 1,
  teacherGap: 1,
  lateLessons: 1,
  classSpread: 1,
  teacherSpread: 1,
  centerBias: 1,
  adjacentSameSubject: 1,
};

const plannerPresetConfigs: PlannerPresetConfig[] = [
  {
    id: "balanced",
    titleKey: "analysis_preset_balanced",
    descriptionKey: "balanced_considers_load_comfort_and_risks",
    weights: defaultPlannerWeights,
  },
  {
    id: "risk",
    titleKey: "analysis_preset_risk",
    descriptionKey: "detects_gaps_overload_and_problematic_slots",
    weights: {
      classDailyLoad: 1.2,
      teacherDailyLoad: 1.2,
      sameSubjectDay: 1.8,
      classGap: 2.5,
      teacherGap: 2.5,
      lateLessons: 2.3,
      classSpread: 1.1,
      teacherSpread: 1.1,
      centerBias: 0.9,
      adjacentSameSubject: 2,
    },
  },
  {
    id: "development",
    titleKey: "analysis_preset_comfort",
    descriptionKey: "prioritizes_in_priority_even_pace_and_comfortable_distribution_at",
    weights: {
      classDailyLoad: 1.7,
      teacherDailyLoad: 1.7,
      sameSubjectDay: 1.4,
      classGap: 0.9,
      teacherGap: 0.9,
      lateLessons: 1,
      classSpread: 2.4,
      teacherSpread: 2.4,
      centerBias: 2,
      adjacentSameSubject: 1.5,
    },
  },
];

export const plannerPresetStorageKey = "admin.schedule.ai.preset.v1";

export const plannerPresetOptions = plannerPresetConfigs.map(({ id, titleKey, descriptionKey }) => ({
  id,
  titleKey,
  descriptionKey,
}));

export const getPlannerPresetWeights = (presetId: PlannerPresetId): PlannerWeights => {
  const selected = plannerPresetConfigs.find((item) => item.id === presetId) ?? plannerPresetConfigs[0];
  return { ...selected.weights };
};

export const isPlannerPresetId = (value: string): value is PlannerPresetId =>
  plannerPresetConfigs.some((item) => item.id === value);

