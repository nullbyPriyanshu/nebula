import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy policy · Nebula" };

export default function PrivacyPage() {
  return (
    <article className="card space-y-4 text-sm leading-6">
      <h1 className="text-xl font-semibold">Privacy policy</h1>

      <p>
        Nebula runs entirely in your browser. Your files travel directly between
        this browser and your own Google accounts. Nebula has no server that
        receives files, stores no files, and keeps no user database.
      </p>

      <h2 className="font-semibold">What Nebula asks Google for</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <code>drive.file</code>: create, read, trash and delete only the files
          Nebula itself uploaded. Nebula cannot see anything else in your Drive.
        </li>
        <li>
          <code>drive.appdata</code>: keep Nebula&apos;s file list (which file is
          in which account) in a hidden app folder in each connected account.
        </li>
      </ul>

      <h2 className="font-semibold">What stays on this device</h2>
      <p>
        Login tokens are held in memory only and disappear when the tab closes.
        On your own device, a copy of the file list is cached in this
        browser&apos;s storage so it loads instantly. In Public PC mode nothing
        is saved on the computer.
      </p>

      <h2 className="font-semibold">No tracking</h2>
      <p>
        Nebula has no ads, no analytics service and no third-party scripts other
        than Google&apos;s sign-in. The Analytics page is computed in your
        browser from your own file list.
      </p>

      <h2 className="font-semibold">Removing access</h2>
      <p>
        Remove an account on the Accounts page, or revoke Nebula at any time at{" "}
        <a className="text-accent underline" rel="noreferrer"
          href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>
        . Files already uploaded stay in the Nebula folder of your Google Drive.
      </p>
    </article>
  );
}
