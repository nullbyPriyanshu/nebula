"use client";

import Link from "next/link";
import { useNebula } from "@/context/NebulaContext";
import { connectAccount } from "@/lib/nebula-store";
import { Icon } from "./Icon";

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className={`flex flex-col gap-2 rounded-[16px] border border-border p-4 ${done ? "bg-lime/50" : "bg-paper"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-muted">0{n}</span>
        <span className={`flex h-6 w-6 items-center justify-center rounded-[6px] border border-border ${done ? "bg-lime text-ink" : "bg-card"}`}>
          {done && <Icon name="check" className="h-4 w-4" />}
          <span className="sr-only">{done ? "Done" : "To do"}</span>
        </span>
      </div>
      <p className="font-sans text-base font-semibold leading-snug">{title}</p>
      <div className="font-sans text-sm font-light text-muted">{children}</div>
    </li>
  );
}

// First-run steps, shown in the empty file panel until the first file is stored.
export function GetStarted({ onUpload }: { onUpload: () => void }) {
  const { index, runtime } = useNebula();

  const accounts = index.accounts.length;
  const connected = index.accounts.some((a) => runtime[a.email]?.connected);
  const files = index.files.length;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="get-started">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="get-started" className="font-sans text-2xl font-semibold">Get started</h2>
          <p className="font-sans text-sm font-light text-muted">Four steps to your pooled space.</p>
        </div>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Step n={1} done={accounts > 0} title="Connect a Google account">
          {accounts > 0 ? (
            <p>Connected.</p>
          ) : (
            <button className="btn btn-primary mt-1 h-9" onClick={connectAccount}>Connect account</button>
          )}
        </Step>
        <Step n={2} done={accounts > 1} title="Add more accounts">
          <p>
            Optional: each adds its free space.{" "}
            <Link href="/accounts/" className="font-semibold text-foreground underline underline-offset-4">Accounts</Link>
          </p>
        </Step>
        <Step n={3} done={false} title="Choose placement">
          <p>
            Optional: fill in order or evenly; turn on safe copies.{" "}
            <Link href="/settings/" className="font-semibold text-foreground underline underline-offset-4">Settings</Link>
          </p>
        </Step>
        <Step n={4} done={files > 0} title="Upload your first file">
          <button className="btn mt-1 h-9" disabled={!connected} onClick={onUpload}>Upload files</button>
        </Step>
      </ol>
    </section>
  );
}
