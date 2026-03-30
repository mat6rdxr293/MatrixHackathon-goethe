import type { LucideIcon } from "lucide-react";

export function StatCard({
  title,
  value,
  caption,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  caption?: string;
  tone?: "good" | "warn";
  icon?: LucideIcon;
}) {
  return (
    <article className={`stat-card${tone ? ` ${tone}` : ""}`}>
      <p>
        {Icon ? <Icon size={15} /> : null}
        <span>{title}</span>
      </p>
      <strong>{value}</strong>
      {caption ? <span>{caption}</span> : null}
    </article>
  );
}

