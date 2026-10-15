"use client";

import { useNebula } from "@/context/NebulaContext";

// Progress of a long bulk job, such as emptying the trash.
export function TaskBar() {
  const { task } = useNebula();

  if (!task) {
    return null;
  }

  return (
    <section className="card space-y-3" aria-live="polite">
      <p className="font-sans text-lg">
        {task.label}… <span className="font-mono">{task.done} / {task.total}</span>
      </p>
      <div
        className="h-2.5 overflow-hidden rounded-full border border-border bg-track"
        role="progressbar"
        aria-label={task.label}
        aria-valuemin={0}
        aria-valuemax={task.total}
        aria-valuenow={task.done}
      >
        <div className="h-full bg-accent transition-[width]" style={{ width: `${(task.done / task.total) * 100}%` }} />
      </div>
    </section>
  );
}
