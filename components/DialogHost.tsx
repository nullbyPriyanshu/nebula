"use client";

import { useEffect, useRef, useState } from "react";
import { useNebula } from "@/context/NebulaContext";
import { answerDialog, type Dialog } from "@/lib/nebula-store";

// Shows the first question the store is waiting on, as a modal <dialog>.
export function DialogHost() {
  const { dialogs } = useNebula();
  const dialog = dialogs[0];

  // A fresh element per question keeps the typed answer from leaking across.
  return dialog ? <Question key={dialog.id} dialog={dialog} /> : null;
}

function Question({ dialog }: { dialog: Dialog }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(dialog.input?.value ?? "");

  useEffect(() => {
    const element = ref.current;

    element?.showModal();

    return () => element?.close();
  }, []);

  const answer = (ok: boolean) =>
    answerDialog(dialog.id, dialog.input ? (ok ? text : null) : dialog.choices ? null : ok);

  return (
    <Modal
      ref={ref}
      title={dialog.title}
      onClose={() => answer(false)}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();

          if (!dialog.choices) answer(true);
        }}
      >
        {dialog.body && (
          <p className="whitespace-pre-line text-sm text-muted">{dialog.body}</p>
        )}
        {dialog.input && (
          <label className="block space-y-1 text-sm">
            <span>{dialog.input.label}</span>
            <input
              autoFocus
              type={dialog.input.secret ? "password" : "text"}
              autoComplete={dialog.input.secret ? "current-password" : "off"}
              className="field w-full"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={(event) => {
                if (dialog.input?.secret) return;

                // Select the name but not the extension, like a file manager.
                const dot = event.target.value.lastIndexOf(".");

                event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
              }}
            />
          </label>
        )}
        {dialog.choices && (
          <div className="flex flex-col gap-2">
            {dialog.choices.map((choice, i) => (
              <button key={choice.value} type="button" autoFocus={i === 0}
                className={i === 0 ? "btn btn-primary" : "btn"}
                onClick={() => answerDialog(dialog.id, choice.value)}>
                {choice.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={() => answer(false)}>
            {dialog.cancel ?? "Cancel"}
          </button>
          {!dialog.choices && (
            <button
              type="submit"
              autoFocus={!dialog.input}
              className={dialog.danger ? "btn btn-danger-solid" : "btn btn-primary"}
              disabled={Boolean(dialog.input) && !text.trim()}
            >
              {dialog.confirm}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}

// A styled native modal: focus trap, Escape and backdrop come from the browser.
export function Modal({
  ref,
  title,
  onClose,
  wide,
  children,
}: {
  ref: React.Ref<HTMLDialogElement>;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? "max-w-4xl" : "max-w-md"}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
