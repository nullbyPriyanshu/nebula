"use client";

import Link from "next/link";
import { useNebula } from "@/context/NebulaContext";
import { connectAccount } from "@/lib/nebula-store";
import { Icon } from "./Icon";

function Step({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-border ${
          done ? "bg-lime text-ink" : "bg-card"
        }`}
      >
        {done && <Icon name="check" className="h-4 w-4" />}
      </span>
      <div className="space-y-1 font-sans text-base">
        <p className={`text-lg font-semibold ${done ? "text-muted line-through" : ""}`}>
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </p>
        {!done && <div className="font-light text-muted">{children}</div>}
      </div>
    </li>
  );
}

// First-run checklist; disappears once an account is connected and a file stored.
export function GetStarted({ onUpload }: { onUpload: () => void }) {
  const { index, runtime } = useNebula();

  const accounts = index.accounts.length;
  const connected = index.accounts.some((a) => runtime[a.email]?.connected);
  const files = index.files.length;

  if (accounts > 0 && files > 0) {
    return null;
  }

  return (
    <section data-reveal className="card grid gap-8 md:grid-cols-[1fr_1.4fr] md:p-10" aria-labelledby="get-started">
      <div className="space-y-3">
        <h2 id="get-started" className="font-sans text-[32px] font-semibold leading-tight max-md:text-2xl">Get started</h2>
        <p className="font-sans text-lg font-light text-muted">
          Nebula pools the free space of several Google accounts into one place.
          Four steps and you are done.
        </p>
      </div>
      <ol className="space-y-5">
        <Step done={accounts > 0} title="Connect a Google account">
          <p>Google asks which account and for permission to store Nebula&apos;s files.</p>
          <button className="btn btn-primary mt-3" onClick={connectAccount}>
            Connect Google account
          </button>
        </Step>
        <Step done={accounts > 1} title="Add more accounts (optional)">
          <p>
            Every extra account adds its free space to the pool.{" "}
            <Link href="/accounts/" className="font-semibold text-foreground underline underline-offset-4">Accounts</Link>
          </p>
        </Step>
        <Step done={false} title="Choose how files are placed (optional)">
          <p>
            Fill accounts in order or spread evenly, and turn on safe mode to keep a
            second copy of everything.{" "}
            <Link href="/settings/" className="font-semibold text-foreground underline underline-offset-4">Settings</Link>
          </p>
        </Step>
        <Step done={files > 0} title="Upload your first file">
          <p>Drop files or folders anywhere on this page, or pick them.</p>
          <button className="btn mt-3" disabled={!connected} onClick={onUpload}>
            Upload files
          </button>
        </Step>
      </ol>
    </section>
  );
}
