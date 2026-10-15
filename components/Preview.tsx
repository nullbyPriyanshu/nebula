"use client";

import { useEffect, useRef, useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import { fileKind, formatBytes } from "@/lib/format";
import type { FileRecord } from "@/lib/index-types";
import { cancelTransfer, downloadFile, loadFile, saveBlob } from "@/lib/nebula-store";
import { Modal } from "./DialogHost";
import { Icon } from "./Icon";

// Text bigger than this is cut off in the preview.
const TEXT_LIMIT = 200_000;

// A preview holds the whole file in memory; past this, offer a download instead.
const PREVIEW_LIMIT = 300 * 1024 * 1024;

const isPdf = (file: FileRecord) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const isText = (file: FileRecord) =>
  file.type.startsWith("text/") ||
  /\.(txt|md|csv|json|log|xml|ya?ml|js|ts|py|java|c|cpp|h|css|html)$/i.test(file.name);

export const canPreview = (file: FileRecord) => {
  const kind = fileKind(file.type, file.name);

  return kind === "image" || kind === "video" || kind === "audio" || isPdf(file) || isText(file);
};

type Loaded = { id: string; url: string; text?: string; blob: Blob };

function Body({ file }: { file: FileRecord }) {
  const { progress } = useNebula();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const tooBig = file.size > PREVIEW_LIMIT;

  useEffect(() => {
    if (tooBig) return;

    let live = true;
    let url: string | null = null;

    void loadFile(file.id).then(async (blob) => {
      if (!live) return;

      if (!blob) {
        setFailed(file.id);

        return;
      }

      url = URL.createObjectURL(blob);
      setLoaded({
        id: file.id,
        url,
        blob,
        text: isText(file) ? await blob.slice(0, TEXT_LIMIT).text() : undefined,
      });
    });

    return () => {
      live = false;
      cancelTransfer(file.id);

      if (url) URL.revokeObjectURL(url);
    };
  }, [file, tooBig]);

  if (tooBig) {
    return (
      <div className="space-y-3 py-12 text-center text-sm">
        <p>
          This file is {formatBytes(file.size)}, too big to preview here without
          risking the tab running out of memory.
        </p>
        <button className="btn btn-primary" onClick={() => void downloadFile(file.id)}>
          <Icon name="download" /> Download instead
        </button>
      </div>
    );
  }

  if (failed === file.id) {
    return (
      <p className="py-12 text-center text-sm text-muted">
        Could not load this file. See the message for why.
      </p>
    );
  }

  if (loaded?.id !== file.id) {
    const fraction = progress[file.id] ?? 0;

    return (
      <div className="space-y-3 py-12 text-center text-sm" aria-live="polite">
        <p>
          {fraction >= 0.99 ? "Checking the file is intact…" : `Loading ${Math.round(fraction * 100)}%`}
          <span className="text-muted"> of {formatBytes(file.size)}</span>
        </p>
        <div className="mx-auto h-1.5 max-w-xs overflow-hidden rounded bg-track">
          <div className="h-full bg-accent" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>
    );
  }

  const kind = fileKind(file.type, file.name);
  const frame = "max-h-[70vh] w-full rounded bg-background";

  return (
    <div className="space-y-3">
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL
        <img src={loaded.url} alt={file.name} className={`${frame} object-contain`} />
      ) : kind === "video" ? (
        <video src={loaded.url} controls className={frame} />
      ) : kind === "audio" ? (
        <audio src={loaded.url} controls className="w-full" />
      ) : isPdf(file) ? (
        <iframe src={loaded.url} title={file.name} className={`${frame} h-[70vh]`} />
      ) : (
        <pre className={`${frame} overflow-auto p-3 font-mono text-xs whitespace-pre-wrap`}>
          {loaded.text}
          {file.size > TEXT_LIMIT && "\n\n… (cut off; download to see the rest)"}
        </pre>
      )}
      <div className="flex justify-end">
        <button className="btn" onClick={() => saveBlob(loaded.blob, file.name)}>
          <Icon name="download" /> Download
        </button>
      </div>
    </div>
  );
}

// Full-screen viewer; ← and → step through the files of the current list.
export function Preview({
  files,
  start,
  onClose,
}: {
  files: FileRecord[];
  start: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const viewable = files.filter(canPreview);
  const [id, setId] = useState(start);
  const at = viewable.findIndex((file) => file.id === id);
  const file = viewable[at];

  useEffect(() => {
    const element = ref.current;

    element?.showModal();

    return () => element?.close();
  }, []);

  const step = (by: number) => {
    const next = viewable[at + by];

    if (next) setId(next.id);
  };

  if (!file) {
    return null;
  }

  return (
    <Modal ref={ref} title={file.name} onClose={onClose} wide>
      <div
        onKeyDown={(event) => {
          if (event.target instanceof HTMLMediaElement) return;
          if (event.key === "ArrowLeft") step(-1);
          if (event.key === "ArrowRight") step(1);
        }}
        className="space-y-3"
      >
        <Body key={file.id} file={file} />
        <div className="flex items-center justify-between gap-2 text-sm">
          <button className="btn" disabled={at <= 0} onClick={() => step(-1)}>
            <Icon name="left" /> Previous
          </button>
          <span className="text-muted">
            {at + 1} of {viewable.length}
          </span>
          <button className="btn" disabled={at >= viewable.length - 1} onClick={() => step(1)}>
            Next <Icon name="right" />
          </button>
        </div>
        <div className="flex justify-end">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
