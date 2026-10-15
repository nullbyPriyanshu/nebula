"use client";

import { useNebula } from "@/context/NebulaContext";
import type { Routing, Theme } from "@/lib/index-types";
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
  setTheme,
} from "@/lib/nebula-store";
import { AppPage } from "@/components/site/AppPage";
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
          Encrypt files in this browser before they reach Google, so Google (or
          anyone with access to the accounts) only holds unreadable bytes. File
          names in Drive are hidden too. Encrypted files cannot be shared by link
          or previewed in Google Drive.
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
          Encrypt new uploads. Files already uploaded stay as they are, and
          encrypted files stay readable with the passphrase either way.
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
    <section data-reveal aria-label={title} className="card card-lift space-y-4">
      <div className="flex items-center gap-4">
        <IconBox name={icon} />
        <h2 className="card-title">{title}</h2>
      </div>
      <div className="space-y-4 font-sans text-base font-light">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { index, mode } = useNebula();
  const { routing, theme, safeMode } = index.settings;

  return (
    <AppPage tag="Settings" title="Settings" lead="How Nebula places, protects and shows your files.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Setting icon="bars" title="Placement">
          <p className="text-muted">
            Which account receives a new file. Both keep each account&apos;s free
            buffer and split a file only when no single account fits it.
          </p>
          <select className="field w-full" aria-label="Routing" value={routing}
            onChange={(event) => setRouting(event.target.value as Routing)}>
            <option value="priority">Priority: fill accounts in order</option>
            <option value="least-used">Least-used: spread evenly</option>
          </select>
        </Setting>

        <Setting icon="shield" title="Safe mode">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-accent" checked={safeMode}
              onChange={(event) => setSafeMode(event.target.checked)} />
            <span>
              Store a second copy of every new file in another account. Uses twice
              the space; needs at least two connected accounts with room.
            </span>
          </label>
        </Setting>

        <Setting icon="lock" title="Encryption">
          <EncryptionSettings />
        </Setting>

        <Setting icon="sparkle" title="Theme">
          <p className="text-muted">The public pages stay light; the app follows this.</p>
          <select className="field w-full" aria-label="Theme" value={theme}
            onChange={(event) => setTheme(event.target.value as Theme)}>
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Setting>

        <div className="lg:col-span-2">
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
                when the tab closes. Turning this on erases the file list saved in
                this browser; your files and the copies in your accounts stay.
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
      </div>
    </AppPage>
  );
}
