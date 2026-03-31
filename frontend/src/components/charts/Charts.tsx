import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SubjectProgress } from "../../types/portal";

const seriesColors = ["#2563eb", "#0ea5e9", "#14b8a6", "#22c55e", "#f59e0b", "#ef4444"];

const chartAxisTick = { fill: "#507382", fontSize: 12 };
const chartMargin = { top: 16, right: 18, left: 8, bottom: 14 };

export function MetricBarChart({
  data,
  valueLabel,
}: {
  data: { label: string; value: number; tone?: "good" | "warn" }[];
  valueLabel: string;
}) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={chartMargin} barCategoryGap="38%">
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="label" tick={chartAxisTick} tickMargin={10} height={52} interval={0} />
          <YAxis tick={chartAxisTick} width={40} domain={[0, (max: number) => Math.ceil((max || 0) * 1.1)]} />
          <Tooltip
            cursor={{ fill: "rgba(20, 116, 134, 0.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #cfe0e5" }}
          />
          <Legend />
          <Bar name={valueLabel} dataKey="value" radius={[6, 6, 0, 0]} barSize={14} maxBarSize={18}>
            {data.map((entry) => (
              <Cell
                key={`${entry.label}-${entry.value}`}
                fill={entry.tone === "warn" ? "#f97316" : "#0891b2"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendBarChart({
  data,
  valueLabel,
}: {
  data: { label: string; value: number }[];
  valueLabel: string;
}) {
  const maxAbs = Math.max(0, ...data.map((item) => Math.abs(item.value)));
  const trendDomain = Number((maxAbs * 1.2 + 0.01).toFixed(2));

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={chartMargin} barCategoryGap="40%">
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="label" tick={chartAxisTick} tickMargin={10} height={52} interval={0} />
          <YAxis tick={chartAxisTick} width={40} domain={[-trendDomain, trendDomain]} />
          <Tooltip
            cursor={{ fill: "rgba(20, 116, 134, 0.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #cfe0e5" }}
          />
          <Bar name={valueLabel} dataKey="value" barSize={14} maxBarSize={18}>
            {data.map((entry) => (
              <Cell
                key={`${entry.label}-${entry.value}`}
                fill={entry.value < 0 ? "#f97316" : "#0ea5e9"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StudentHistoryChart({
  progress,
  scoreLabel,
}: {
  progress: SubjectProgress[];
  scoreLabel: string;
}) {
  const labels = Array.from(
    new Set(progress.flatMap((item) => item.history.map((point) => point.date))),
  ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const chartData = labels.map((date) => {
    const row: Record<string, string | number | undefined> = { date: date.slice(5) };
    for (const subject of progress) {
      row[subject.subject] = subject.history.find((point) => point.date === date)?.score;
    }
    return row;
  });

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={chartMargin}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="date" tick={chartAxisTick} tickMargin={10} height={44} />
          <YAxis domain={[2.9, 5.1]} tick={chartAxisTick} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #cfe0e5" }}
            formatter={(value) => {
              const numericValue = Number(value ?? 0);
              return [numericValue.toFixed(1), scoreLabel];
            }}
          />
          <Legend />
          {progress.map((item, index) => (
            <Line
              key={item.subject}
              type="monotone"
              dataKey={item.subject}
              stroke={seriesColors[index % seriesColors.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

