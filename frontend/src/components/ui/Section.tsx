import type { ReactNode } from "react";

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section-card">
      <header className="section-head">
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

