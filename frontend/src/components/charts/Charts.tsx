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
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="label" tick={{ fill: "#507382", fontSize: 12 }} />
          <YAxis tick={{ fill: "#507382", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "rgba(20, 116, 134, 0.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #cfe0e5" }}
          />
          <Legend />
          <Bar name={valueLabel} dataKey="value" radius={[8, 8, 0, 0]}>
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
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="label" tick={{ fill: "#507382", fontSize: 12 }} />
          <YAxis tick={{ fill: "#507382", fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: "rgba(20, 116, 134, 0.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid #cfe0e5" }}
          />
          <Bar name={valueLabel} dataKey="value" radius={[8, 8, 0, 0]}>
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
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe8ec" />
          <XAxis dataKey="date" tick={{ fill: "#507382", fontSize: 12 }} />
          <YAxis domain={[3, 5]} tick={{ fill: "#507382", fontSize: 12 }} />
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

