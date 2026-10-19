"use client";

import type { ReactNode } from "react";
import { preload } from "react-dom";
import { Container, GrainSection, PlainSection, Tag } from "@/components/landing/parts";
import { InterruptedBanner } from "../InterruptedBanner";
import { ReconnectBanner } from "../ReconnectBanner";
import { TaskBar } from "./TaskBar";

// Every app page has the landing page's shape: a grain band with the section
// label, the title, the page's main actions and an illustration, then a plain
// band with the faint grid lines holding the content.
//
// On large screens the page fills exactly one screen: the content area takes
// the height left over, and pages scroll inside their own panels instead.
// Phones scroll normally.
export function AppPage({
  tag,
  title,
  lead,
  actions,
  art,
  children,
}: {
  tag: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  // An illustration from /art, shown beside the title on wide screens.
  art?: string;
  children: ReactNode;
}) {
  // Fetched with the page, so the illustration does not pop in afterwards.
  if (art) preload(art, { as: "image", fetchPriority: "high" });

  return (
    <div className="flex flex-col lg:min-h-0 lg:flex-1">
      <GrainSection label={tag} className="shrink-0 border-b border-border/15">
        <Container className="flex items-center justify-between gap-6 py-6 max-md:py-5 lg:[@media(max-height:820px)]:py-3">
          <div className="flex min-w-0 flex-col items-start gap-3">
            <div className="lg:[@media(max-height:820px)]:hidden">
              <Tag>{tag}</Tag>
            </div>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <h1 className="font-sans text-[40px] font-semibold leading-[1.05] text-foreground max-md:text-[30px]">{title}</h1>
              {lead && <p className="max-w-130 pb-1 font-sans text-base font-light text-muted lg:[@media(max-height:820px)]:hidden">{lead}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-6">
            {actions && <div className="flex flex-wrap justify-end gap-3 max-md:hidden">{actions}</div>}
            {art && (
              // eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration
              <img src={art} alt="" className="-my-6 hidden h-33 w-auto self-end xl:block lg:[@media(max-height:820px)]:-my-3 lg:[@media(max-height:820px)]:h-20" />
            )}
          </div>
        </Container>
        {actions && (
          <Container className="flex flex-wrap gap-3 pb-5 md:hidden">{actions}</Container>
        )}
      </GrainSection>
      <PlainSection
        className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        innerClassName="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col"
        squares={[["14%", "40px"], ["86%", "50%"]]}
      >
        <Container className="flex flex-col gap-5 py-6 max-md:gap-4 max-md:py-4 lg:min-h-0 lg:flex-1">
          <ReconnectBanner />
          <InterruptedBanner />
          <TaskBar />
          <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">{children}</div>
        </Container>
      </PlainSection>
    </div>
  );
}

// A panel that scrolls inside itself on large screens, so the page does not.
export function Panel({
  title,
  aside,
  children,
  className = "",
  bodyClassName = "",
  label,
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`flex flex-col overflow-hidden rounded-[24px] border border-border bg-card lg:min-h-0 ${className}`}
    >
      {(title || aside) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          {typeof title === "string" ? <h2 className="font-sans text-xl font-semibold">{title}</h2> : title}
          {aside}
        </div>
      )}
      <div className={`p-5 max-md:p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${bodyClassName}`}>{children}</div>
    </section>
  );
}
