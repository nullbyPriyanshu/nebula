import type { Metadata } from "next";
import { AppPage } from "@/components/site/AppPage";

export const metadata: Metadata = { title: "Privacy policy · Nebula" };

export default function PrivacyPage() {
  return (
    <AppPage tag="Privacy" title="Privacy policy" lead="What Nebula does with your files and data: as little as possible.">
    <article data-reveal className="card max-w-[860px] space-y-4 font-sans text-base font-light leading-7 [&_h2]:pt-2 [&_h2]:text-xl [&_h2]:font-semibold">

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
        On your own device, this browser&apos;s storage keeps a copy of the file
        list (so it loads instantly and offline), small image thumbnails, your
        recent searches and which files you opened recently. The app itself is
        cached so it opens offline. In Public PC mode none of this is saved on
        the computer.
      </p>

      <h2 className="font-semibold">Encryption</h2>
      <p>
        If you turn on encryption, files are encrypted in this browser before
        they are uploaded, so Google only stores unreadable data under a neutral
        name. Your passphrase never leaves this browser and is kept in memory
        only. Nebula cannot recover it. File names, folders and sizes are still
        listed in Nebula&apos;s own file list in your accounts.
      </p>

      <h2 className="font-semibold">Sharing</h2>
      <p>
        A share link lets anyone who has it view the file in Google Drive.
        Google has no expiry for such links, so Nebula removes an expiring link
        the next time you use Nebula after its date.
      </p>

      <h2 className="font-semibold">No tracking</h2>
      <p>
        Nebula has no ads, no analytics service and no third-party scripts other
        than Google&apos;s sign-in. The Analytics page is computed in your
        browser from your own file list. For files not opened on this device,
        thumbnails are loaded from Google&apos;s image servers.
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
    </AppPage>
  );
}
