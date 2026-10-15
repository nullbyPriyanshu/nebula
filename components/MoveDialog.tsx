"use client";

import { useEffect, useRef, useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import { folderName, ROOT } from "@/lib/folders";
import { askText, createFolder, foldersOf, moveFiles } from "@/lib/nebula-store";
import { Modal } from "./DialogHost";
import { Icon } from "./Icon";

const depth = (path: string) => (path === ROOT ? 0 : path.split("/").length - 1);

// Pick a destination folder from the whole tree; also the keyboard way to move.
export function MoveDialog({
  ids,
  from,
  onClose,
}: {
  ids: string[];
  from: string;
  onClose: () => void;
}) {
  const { index } = useNebula();
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(from);

  const folders = [ROOT, ...foldersOf(index)];

  useEffect(() => {
    const element = ref.current;

    element?.showModal();

    return () => element?.close();
  }, []);

  return (
    <Modal ref={ref} title={`Move ${ids.length === 1 ? "file" : `${ids.length} files`}`} onClose={onClose}>
      <ul
        role="listbox"
        aria-label="Destination folder"
        className="max-h-72 overflow-y-auto rounded-md border border-border"
      >
        {folders.map((folder) => (
          <li key={folder} role="option" aria-selected={folder === target}>
            <button
              className={`flex w-full items-center gap-2 py-2 pr-3 text-left text-sm ${
                folder === target ? "bg-accent text-accent-foreground" : "hover:bg-background"
              }`}
              style={{ paddingLeft: `${0.75 + depth(folder) * 1}rem` }}
              onClick={() => setTarget(folder)}
              onDoubleClick={() => {
                moveFiles(ids, folder);
                onClose();
              }}
            >
              <Icon name="folder" />
              <span className="truncate">{folder === ROOT ? "My files" : folderName(folder)}</span>
              {folder === from && <span className="ml-auto text-xs opacity-75">current</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          className="btn"
          onClick={async () => {
            const name = await askText({
              title: "New folder",
              label: `Inside ${target === ROOT ? "My files" : folderName(target)}`,
              confirm: "Create",
            });
            const path = name ? createFolder(target, name) : null;

            if (path) setTarget(path);
          }}
        >
          <Icon name="plus" /> New folder
        </button>
        <div className="flex gap-2">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            disabled={target === from}
            onClick={() => {
              moveFiles(ids, target);
              onClose();
            }}
          >
            Move here
          </button>
        </div>
      </div>
    </Modal>
  );
}
