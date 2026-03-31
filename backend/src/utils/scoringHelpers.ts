export const clampScore = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export const roundTo = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const averageOf = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, item) => sum + item, 0) / values.length;
};

export const deviation = (values: number[]) => {
  if (values.length < 2) {
    return 0;
  }
  const mean = averageOf(values);
  const variance = averageOf(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

export const ratioToPercent = (part: number, total: number) => {
  if (total <= 0) {
    return 0;
  }
  return (part / total) * 100;
};

export const normalizeByThreshold = (value: number, threshold: number) => {
  if (threshold <= 0) {
    return 0;
  }
  return clampScore((value / threshold) * 100, 0, 100);
};

