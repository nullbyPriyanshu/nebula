"use client";

import { useNebula } from "@/context/NebulaContext";
import type { Routing } from "@/lib/index-types";
import {
  ask,
  askText,
  changePassphrase,
  chooseMode,
  lock,
  notify,
  requireKey,
  setEncrypt,
  setUpEncryption,
  logoutAll,
  setRouting,
  setSafeMode,
} from "@/lib/nebula-store";
import { AppPage } from "@/components/site/AppPage";
import { Select } from "@/components/Select";
import { IconBox } from "@/components/landing/parts";

// Asks twice; null when cancelled or the two do not match.
async function newPassphrase(title: string) {
  const first = await askText({
    title,
    body: "Use a long phrase you will remember. Nebula cannot recover it: without it, encrypted files are lost for good.",
    label: "Passphrase (at least 10 characters)",
    secret: true,
    confirm: "Next",
  });

  if (!first) return null;

  if (first.length < 10) {
    notify("error", "Use at least 10 characters.");

    return null;
  }

  const again = await askText({ title, label: "Type it again", secret: true, confirm: "Confirm" });

  if (again !== first) {
    if (again) notify("error", "The two passphrases did not match.");

    return null;
  }

  return first;
}

function EncryptionSettings() {
  const { index, unlocked } = useNebula();
  const { encrypt, encryption } = index.settings;

  if (!encryption) {
    return (
      <>
        <p className="text-sm text-muted">
          Encrypt files in this browser before they reach Google, so Google only
          holds unreadable bytes, names included. Encrypted files can&apos;t be
          shared by link or previewed in Drive.
        </p>
        <button
          className="btn"
          onClick={async () => {
            const passphrase = await newPassphrase("Set up encryption");

            if (!passphrase) return;

            const ok = await ask({
              title: "Turn on encryption?",
              body: "If you forget this passphrase, nobody can open your encrypted files, not even with access to your Google accounts. Write it down somewhere safe.",
              confirm: "I understand, turn it on",
            });

            if (ok) await setUpEncryption(passphrase);
          }}
        >
          Set up encryption
        </button>
      </>
    );
  }

  return (
    <>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={encrypt}
          onChange={(event) => void setEncrypt(event.target.checked)} />
        <span>
          Encrypt new uploads. Files already uploaded stay as they are.
        </span>
      </label>
      <p className="text-sm text-muted">
        {unlocked
          ? "Unlocked for this session."
          : "Locked: Nebula asks for the passphrase when it first needs it."}
      </p>
      <div className="flex flex-wrap gap-2">
        {unlocked ? (
          <button className="btn" onClick={lock}>Lock now</button>
        ) : (
          <button className="btn" onClick={() => void requireKey().catch(() => {})}>Unlock</button>
        )}
        <button
          className="btn"
          onClick={async () => {
            try {
              await requireKey();
            } catch {
              return;
            }

            const passphrase = await newPassphrase("Change passphrase");

            if (passphrase) await changePassphrase(passphrase);
          }}
        >
          Change passphrase
        </button>
      </div>
    </>
  );
}

// One setting: an icon, a title, what it does, then its control.
function Setting({
  icon,
  title,
  children,
}: {
  icon: Parameters<typeof IconBox>[0]["name"];
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="card space-y-3 lg:h-full lg:p-5">
      <div className="flex items-center gap-3">
        <IconBox name={icon} size="h-10 w-10" />
        <h2 className="card-title lg:text-xl">{title}</h2>
      </div>
      <div className="space-y-3 font-sans text-base font-light">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { index, mode } = useNebula();
  const { routing, safeMode } = index.settings;

  return (
    <AppPage tag="Settings" title="Settings" lead="How Nebula places and protects your files." art="/art/laptop.svg">
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:content-start">
        <Setting icon="bars" title="Placement">
          <p className="text-muted">
            Which account gets a new file. A file is split only when no single
            account fits it.
          </p>
          <Select<Routing>
            label="Placement"
            className="w-full"
            value={routing}
            onChange={setRouting}
            options={[
              { value: "priority", label: "Priority: fill accounts in order" },
              { value: "least-used", label: "Least-used: spread evenly" },
            ]}
          />
        </Setting>

        <Setting icon="shield" title="Safe mode">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-accent" checked={safeMode}
              onChange={(event) => setSafeMode(event.target.checked)} />
            <span>
              Keep a second copy of every new file in another account. Uses twice
              the space and needs two accounts with room.
            </span>
          </label>
        </Setting>

        <Setting icon="lock" title="Encryption">
          <EncryptionSettings />
        </Setting>

        <div className="md:col-span-2">
          <Setting icon="user" title="Public PC mode">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-accent"
                checked={mode === "public"}
                onChange={async (event) => {
                  if (!event.target.checked) {
                    void chooseMode("private");

                    return;
                  }

                  const ok = await ask({
                    title: "Turn on Public PC mode?",
                    body: "The file list saved in this browser is erased and you are logged out after 5 idle minutes. Your files and the copies of the list in your accounts stay.",
                    confirm: "Turn on",
                  });

                  if (ok) void chooseMode("public");
                }}
              />
              <span>
                Save nothing on this computer and log out after 5 idle minutes or
                when the tab closes. Your files and accounts are untouched.
              </span>
            </label>
            <button className="btn btn-danger" onClick={async () => {
              const ok = await ask({
                title: "Log out of every account?",
                body: "Uploads and downloads in progress stop. You can reconnect at any time.",
                confirm: "Log out",
                danger: true,
              });

              if (ok) logoutAll();
            }}>
              Log out of every account now
            </button>
          </Setting>
        </div>

        <Setting icon="sparkle" title="About this browser">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
            <img src="/art/cloud.svg" alt="" className="h-12 w-auto shrink-0" />
            <p className="text-muted">
              {mode === "public"
                ? "Public PC mode: nothing is kept here after you leave."
                : "Your file list is saved in this browser so it opens instantly, even offline."}
            </p>
          </div>
          <p className="text-sm text-muted">
            Shortcuts on My files: <kbd className="font-mono">/</kbd> search ·{" "}
            <kbd className="font-mono">M</kbd> move · <kbd className="font-mono">Del</kbd> trash ·{" "}
            <kbd className="font-mono">?</kbd> all shortcuts
          </p>
        </Setting>
      </div>
    </AppPage>
  );
}
