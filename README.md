# Nebula

Pool the free space of up to five Google accounts into one file space. Nebula
runs entirely in the browser: files go straight from the browser to your own
Google Drive accounts, and there is no Nebula server.

## Features

- **One pool, several accounts.** New files go to the highest-priority account
  with room, or are spread evenly ("least-used" routing). A file that fits in no
  single account can be split across several, after asking.
- **Safe mode.** Keeps a second copy of each new file in another account.
- **Encryption (optional).** Files are encrypted in the browser (AES-256-GCM,
  in 8 MB chunks) before they reach Google, under a neutral name. The key is
  wrapped with your passphrase (PBKDF2, 600,000 rounds), so changing the
  passphrase re-encrypts nothing. **A forgotten passphrase cannot be recovered.**
- **Works across devices and tabs.** Each account keeps a copy of Nebula's file
  list. Copies are merged record by record, with deletions remembered, so changes
  made on two devices both survive. Nebula syncs on focus and every minute.
- **Moving files off an account** copies everything stored there to the other
  accounts, checks every byte, and only then deletes the originals. Use it to
  free an account or before removing it.
- **File manager.** Folders, folder upload (drag a folder or pick one), rename
  (also in Google Drive), move (drag onto a folder or breadcrumb, or use
  *Move to…*), stars, multi-select with bulk download/move/trash (long-press to
  select on touch screens), and list/grid views with thumbnails. *Starred*,
  *Recent* and *Shared* views. Search matches every word in any order, ignores
  accents, and also matches folder names. The current folder, search and view
  are kept in the URL. Undo for trash, move, rename and folder delete.
- **Preview** images, video, audio, PDFs and text without downloading them first.
- **Uploads** run up to three at a time, to different accounts. They can be
  paused, resumed and cancelled, and show speed and time left. Duplicate
  content is detected (with *Upload anyway*). A different file with the same
  name is kept as `name (2).ext`, with an option to replace the older one.
- **Downloads** stream straight to disk in Chrome and Edge, so file size is not
  limited by memory. Every piece is checked against its SHA-256 hash, and the
  file is only kept if everything checks out. Other browsers download in memory,
  with a warning above 1 GB. Several files can go into one chosen folder.
- **Trash** with undo, bulk restore/delete and automatic deletion after 30 days.
- **Sharing:** create an "anyone with the link" Drive link for 1, 7 or 30 days or
  without expiry, or open the file in Google Drive. Google cannot expire such
  links, so Nebula revokes them the next time it runs after the date.
- **Installable** as an app, which opens offline and shows the saved file list.
- **Logins** are renewed in one click: Nebula offers it 5 minutes before one ends.
- **Privacy:** logins live in memory only. *Public PC mode* saves nothing on the
  computer and logs out after 5 idle minutes.

### Keyboard shortcuts (My files)

| Key | Action |
| --- | --- |
| `/` | Search |
| `Ctrl`/`⌘` + `A` | Select every file shown |
| `Delete` | Move selected files to the trash |
| `M` | Move selected files |
| `Esc` | Clear the selection |
| `←` `→` | Previous / next file in the preview |
| `?` | Show shortcuts |

## Setup

1. Create a Google Cloud project, enable the **Google Drive API**, and create an
   OAuth client ID of type *Web application*. Add your site's origin (and
   `http://localhost:3000` for development) as an authorised JavaScript origin.
2. Put the client ID in `.env.local`:

   ```
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```

3. Install and run:

   ```bash
   pnpm install
   pnpm dev      # http://localhost:3000
   ```

Nebula asks Google for two scopes: `drive.file` (only files Nebula created) and
`drive.appdata` (a hidden copy of Nebula's file list in each account).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Static export to `out/`, then adds each page's script hashes to its CSP |
| `pnpm start` | Serves `out/` on port 4173 with the production security headers |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright) against the build; run `pnpm build` first |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm headers` | Rewrites `vercel.json` and `public/_headers` from `scripts/security-headers.mjs` |

The browser tests fake Google sign-in and Drive at the network level
(`e2e/fake-google.ts`), so they need no real account. Run
`pnpm exec playwright install chromium` once. CI (`.github/workflows/ci.yml`)
runs every check on each push and pull request.

### Hosting and security headers

The app is a static export (`output: "export"`), so `out/` can be hosted
anywhere. The security headers are defined once, in
`scripts/security-headers.mjs`. `pnpm headers` writes them for Vercel
(`vercel.json`) and Netlify / Cloudflare Pages (`public/_headers`), and a test
fails if the two drift apart. Elsewhere, set the same headers on your server.
Each page also carries its own policy listing the hashes of its inline scripts,
so `'unsafe-inline'` is ignored for scripts in every browser that supports hashes.

## Layout

- `app/`: pages. `/` is the landing page; the app is `/files/`, `/accounts/`,
  `/analytics/`, `/trash/` and `/settings/`; `/security/`, `/faq/` (Help) and
  `/privacy/` are public pages
- `components/landing/`: landing page sections and shared building blocks
- `components/site/`: header, footer and `AppPage`, the layout every app page uses
- `components/`: UI pieces (dialogs, toasts, file rows, preview, upload queue…)
- `public/art/`: the illustrations (original SVGs)
- `lib/store/`: app state and every action, by concern: `core` (state, saving,
  dialogs, notices), `accounts` (logins, settings, sync), `uploads`, `transfers`
  (downloads, previews), `files` (trash, rename, move, share, folders),
  `evacuate` (moving files off an account), `vault` (the encryption key).
  `lib/nebula-store.ts` re-exports them all.
- `lib/index-store.ts`: merging copies of the file list
- `lib/crypto.ts`: chunked encryption
- `lib/google/`: Google sign-in and Drive API calls
- `lib/storage/`: storage adapter and placement (which account gets a file)
- `lib/thumbs.ts`: image and video thumbnails, cached on this device only
- `e2e/`: browser tests; `tests/`: unit tests; `scripts/`: build and hosting helpers
