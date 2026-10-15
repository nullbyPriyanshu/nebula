"use client";

import { useEffect, useRef, useState } from "react";
import { fileKind } from "@/lib/format";
import type { FileRecord } from "@/lib/index-types";
import { driveThumbnail } from "@/lib/nebula-store";
import { getThumb, onThumb } from "@/lib/thumbs";
import { Icon, KIND_ICON } from "./Icon";

// The image thumbnail cached on this device, or the file type's icon.
export function Thumb({ file, large }: { file: FileRecord; large?: boolean }) {
  const kind = fileKind(file.type, file.name);
  const [url, setUrl] = useState<string | null>(null);
  const [remote, setRemote] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Only look for a thumbnail once the tile scrolls into view.
  useEffect(() => {
    const element = box.current;

    if (!element || seen) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    }, { rootMargin: "200px" });

    observer.observe(element);

    return () => observer.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen || (kind !== "image" && kind !== "video")) return;

    let current: string | null = null;
    let live = true;

    const load = async () => {
      const blob = await getThumb(file.id);

      if (!live) return;

      // None made on this device: ask Google for its own.
      if (!blob) {
        const link = await driveThumbnail(file);

        if (live && link) setRemote(link);

        return;
      }

      if (current) URL.revokeObjectURL(current);
      current = URL.createObjectURL(blob);
      setUrl(current);
    };

    void load();

    const stop = onThumb((id) => {
      if (id === file.id) void load();
    });

    return () => {
      live = false;
      stop();

      if (current) URL.revokeObjectURL(current);
    };
  }, [file, kind, seen]);

  const size = large ? "aspect-[4/3] w-full" : "h-10 w-10";

  const src = url ?? (broken ? null : remote);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a blob: URL or Google's thumbnail
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`${size} shrink-0 rounded object-cover`}
      />
    );
  }

  return (
    <div ref={box} className={`${size} flex shrink-0 items-center justify-center rounded bg-background text-muted`}>
      <Icon name={KIND_ICON[kind]} className={large ? "h-10 w-10" : "h-5 w-5"} />
    </div>
  );
}
