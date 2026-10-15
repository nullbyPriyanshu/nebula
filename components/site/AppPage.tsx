"use client";

import type { ReactNode } from "react";
import { Container, GrainSection, PlainSection, Tag } from "@/components/landing/parts";
import { ReconnectBanner } from "../ReconnectBanner";
import { TaskBar } from "./TaskBar";

// Every app page has the landing page's shape: a grain band with the section
// label, a big title and the page's main actions, then a plain band with the
// faint grid lines holding the content.
export function AppPage({
  tag,
  title,
  lead,
  actions,
  children,
}: {
  tag: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <GrainSection label={tag}>
        <Container className="py-14 max-md:py-8">
          <div data-reveal className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[760px] flex-col items-start gap-5 max-md:gap-3">
              <Tag>{tag}</Tag>
              <h1 className="l-h2">{title}</h1>
              {lead && <p className="l-lead text-muted">{lead}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
          </div>
        </Container>
      </GrainSection>
      <PlainSection squares={[["14%", "64px"], ["86%", "40%"], ["37.4%", "92%"]]}>
        <Container className="min-h-[50vh] space-y-6 py-12 max-md:space-y-4 max-md:py-6">
          <ReconnectBanner />
          <TaskBar />
          {children}
        </Container>
      </PlainSection>
    </>
  );
}
