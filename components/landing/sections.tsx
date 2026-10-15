"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useNebula } from "@/context/NebulaContext";
import {
  Arrow,
  Chevron,
  Container,
  Glyph,
  GrainSection,
  IconBox,
  Logo,
  PlainSection,
  Square,
  Tag,
} from "./parts";

// The sections of the public pages, in the style of the site: grain and
// plain bands, charcoal outlines, lime buttons.

// The main call to action: start (choose a mode) on a first visit, or go
// straight to the files once a mode is chosen.
export function StartLink({ className = "l-btn l-btn-lime", label }: { className?: string; label?: string }) {
  const { mode } = useNebula();
  const started = mode === "private" || mode === "public";

  return (
    <Link href={started ? "/files/" : "/#modes"} className={className}>
      {started ? "Open my files" : (label ?? "Start free")} <Arrow />
    </Link>
  );
}

// The hero card is a sheet of paper with its top-right corner folded over.
export function Hero() {
  return (
    <GrainSection id="top" label="Introduction" className="pb-16">
      <Container className="relative flex flex-col items-center pt-[120px] max-md:pt-12">
        <div className="relative mx-auto w-full max-w-[1079px]">
          <div
            data-reveal
            className="relative min-h-[657px] rounded-[20px] border-2 border-ink bg-vanilla text-ink max-lg:min-h-0"
            style={{ clipPath: "polygon(0 0, calc(100% - 118px) 0, 100% 101px, 100% 100%, 0 100%)" }}
          >
            <div className="relative z-10 flex min-h-[653px] flex-col justify-evenly gap-8 px-12 py-12 max-lg:min-h-0 max-md:px-6 max-md:pt-[110px] lg:max-w-[600px]">
              <h1 className="font-mono text-[60px] font-bold leading-[1.1] max-[1400px]:text-[54px] max-[1200px]:text-[48px] max-md:text-[34px]">
                One drive, <br className="max-md:hidden" />every account
              </h1>
              <p className="max-w-[440px] font-sans text-2xl font-normal leading-[1.4] max-[1200px]:text-xl">
                Pool the free 15 GB of up to five Google accounts into one space.
                Files go straight from your browser to your own Drive.
              </p>
              <div>
                <StartLink />
              </div>
              <p className="font-sans text-xl font-light">
                Want to know more?{" "}
                <Link href="/faq/" className="font-mono text-lg font-bold uppercase underline underline-offset-4">
                  Read the FAQ
                </Link>
              </p>
            </div>
            {/* Small screens: the illustration sits inside the card, under the text. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
            <img
              src="/art/hero.svg"
              alt=""
              className="pointer-events-none mx-auto w-[min(100%,420px)] lg:hidden"
            />
          </div>
          {/* The folded corner: a blue flap with the card's edge along its fold. */}
          <svg aria-hidden viewBox="0 0 118 101" className="absolute right-0 top-0 h-[101px] w-[118px]">
            <path d="M1 1 L117 100 L12 100 Q1 100 1 89 Z" fill="#058bff" />
            <path d="M1 1 L117 100 M1 1 L1 89 Q1 100 12 100 L117 100" fill="none" stroke="#383838" strokeWidth="2" />
          </svg>
          {/* Large screens: the mascot sits over the card, past its edge. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
          <img
            src="/art/hero.svg"
            alt="Nebby the octopus holding a folder and a cloud in front of a storage panel"
            className="pointer-events-none absolute bottom-[2px] right-[2px] w-[540px] max-[1200px]:w-[460px] max-lg:hidden"
          />
        </div>
      </Container>
      <WorksWith />
    </GrainSection>
  );
}

// A slow marquee of where Nebula runs, in place of customer logos.
function WorksWith() {
  return (
    <>
      <div className="mt-20 text-center">
        <h2 className="mb-12 font-mono text-2xl font-medium text-ink">Works wherever you do</h2>
        <div className="relative w-full overflow-hidden">
          <div className="marquee flex w-max items-center gap-16">
            {[0, 1].map((copy) =>
              ["Google Drive", "Chrome", "Edge", "Firefox", "Safari", "Android", "iPhone", "Windows", "macOS", "Linux"].map((name) => (
                <span key={`${copy}-${name}`} aria-hidden={copy === 1}
                  className="font-sans text-[40px] font-bold tracking-tight text-[#58534f] opacity-80 max-md:text-3xl">
                  {name}
                </span>
              )),
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Window({ title, children, className = "" }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex h-[38px] items-center gap-2 border-b border-ink/15 px-4">{title}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// A drawing of the app itself: accounts on the left, the pooled files on the right.
export function AppMock() {
  const accounts = [
    { email: "me@gmail.com", used: 72, color: "bg-[#058bff]" },
    { email: "school@gmail.com", used: 38, color: "bg-[#b095fa]" },
    { email: "old.me@gmail.com", used: 55, color: "bg-[#fd7876]" },
  ];
  const files = [
    ["Thesis draft.pdf", "#fd7876"], ["Lab photos", "#b095fa"], ["Lecture 7.mp4", "#058bff"],
    ["Budget.xlsx", "#e9ff91"], ["Holiday", "#97d4ff"], ["Notes.md", "#f4ffc9"],
  ];

  return (
    <div className="grid overflow-hidden rounded-[20px] border border-ink bg-[#fafafa] md:grid-cols-[2fr_3fr]" aria-hidden>
      <Window
        className="border-ink md:border-r"
        title={
          <>
            <Logo className="h-4 w-4" />
            <span className="font-sans text-[15px] font-semibold text-ink">Accounts</span>
          </>
        }
      >
        <div className="space-y-4 p-6">
          {accounts.map((account) => (
            <div key={account.email} className="rounded-[12px] border border-ink/20 bg-white p-3">
              <div className="flex justify-between font-sans text-sm text-ink">
                <span>{account.email}</span>
                <span className="text-ink/60">{account.used}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded bg-[#e5ded5]">
                <div className={`h-full ${account.color}`} style={{ width: `${account.used}%` }} />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-[12px] border border-ink/20 bg-white px-4 py-3 font-sans text-sm text-ink/50">
            <span>Drop files to upload…</span>
            <span className="rounded-md bg-[#e5ded5] px-3 py-1 text-xs text-ink/70">Upload</span>
          </div>
        </div>
      </Window>
      <Window
        className="bg-vanilla"
        title={
          <>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            <span className="ml-2 flex-1 rounded border border-ink/15 bg-[#efebe6] px-3 py-0.5 font-mono text-xs text-ink/60">
              nebula · My files
            </span>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4 p-6 sm:grid-cols-3">
          {files.map(([name, color]) => (
            <div key={name} className="rounded-[12px] border border-ink/20 bg-white p-2">
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-[#f3efe9]">
                <div className="absolute inset-x-0 bottom-0 h-1/3 opacity-60" style={{ background: color }} />
                <span className="relative flex h-10 w-8 items-center justify-center rounded-[4px] border border-ink bg-white">
                  <span className="h-1 w-4 rounded" style={{ background: color }} />
                </span>
              </div>
              <p className="mt-2 truncate font-sans text-xs text-ink">{name}</p>
            </div>
          ))}
        </div>
      </Window>
    </div>
  );
}

export function OneSpace() {
  return (
    <PlainSection label="How it looks" squares={[["14%", "190px"], ["37.4%", "92%"], ["86%", "95%"]]}>
      <Container className="py-[90px]">
        <div data-reveal className="mx-auto mb-16 max-w-[860px] text-center">
          <h2 className="l-h2">Your accounts become one space</h2>
          <p className="l-lead mx-auto mt-6 max-w-[660px] text-ink/85">
            No juggling logins. Connect each Google account once and Nebula
            shows every file together, placing new ones wherever there is room.
          </p>
        </div>
        <div data-reveal>
          <AppMock />
        </div>
      </Container>
    </PlainSection>
  );
}

const AUDIENCES = {
  Students: [
    { icon: "bars", value: "75 GB", label: "of free storage", note: "with five Google accounts" },
    { icon: "clock", value: "< 1 min", label: "to connect an account", note: "one Google sign-in" },
    { icon: "zero", value: "Zero", label: "servers in between", note: "browser to Drive, directly" },
  ],
  Families: [
    { icon: "user", value: "5", label: "accounts in one pool", note: "set which fills first" },
    { icon: "shield", value: "2×", label: "copies with safe mode", note: "in two different accounts" },
    { icon: "undo", value: "30 days", label: "to restore from the trash", note: "and undo for every change" },
  ],
  "Shared computers": [
    { icon: "zero", value: "0 bytes", label: "left on the computer", note: "in Public PC mode" },
    { icon: "clock", value: "5 min", label: "until idle logout", note: "and on closing the tab" },
    { icon: "lock", value: "1 click", label: "to log out everywhere", note: "logins are never saved" },
  ],
} as const;

export function Audience() {
  const [tab, setTab] = useState<keyof typeof AUDIENCES>("Students");

  return (
    <GrainSection id="features" label="Who it's for">
      <Container className="relative py-[100px]">
        <header data-reveal className="mb-12 flex flex-col items-start gap-6">
          <Tag>Who it&apos;s for</Tag>
          <h2 className="l-h2">Built for anyone running out of space</h2>
        </header>
        <div data-reveal className="relative rounded-[34px] border border-ink bg-vanilla">
          <div role="tablist" aria-label="Who it's for" className="flex flex-wrap gap-2 px-10 py-4 max-md:px-4">
            {(Object.keys(AUDIENCES) as (keyof typeof AUDIENCES)[]).map((name) => (
              <button
                key={name}
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`rounded-full px-6 py-3 font-sans text-base font-medium transition-colors ${
                  tab === name ? "bg-ink text-white" : "text-ink/50 hover:text-ink"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="grid border-y border-ink md:grid-cols-3">
            {AUDIENCES[tab].map((stat, i) => (
              <div key={stat.label} className={`flex flex-col items-center px-6 py-10 text-center ${i > 0 ? "border-ink max-md:border-t md:border-l" : ""}`}>
                <span className="text-ink/50"><Glyph name={stat.icon} /></span>
                <p className="mt-2 font-mono text-[56px] font-bold leading-tight text-ink max-md:text-[44px]">{stat.value}</p>
                <p className="font-sans text-lg font-semibold text-ink">{stat.label}</p>
                <p className="font-sans text-sm font-light text-ink/60">{stat.note}</p>
              </div>
            ))}
          </div>
          <Square still className="left-0 top-[calc(100%-145px)] max-md:hidden" />
          <Square still className="left-full top-[calc(100%-145px)] max-md:hidden" />
          <div className="px-8 py-10 text-center">
            <p className="font-sans text-[32px] font-semibold text-ink max-md:text-2xl">
              Stop deleting files. Start pooling space.
            </p>
            <p className="mx-auto mt-3 max-w-[660px] font-sans text-lg font-light text-ink/80">
              Nebula adds up the free space you already have, keeps a buffer for
              Gmail and Photos, and splits a file across accounts only when nothing
              else fits, and only after asking.
            </p>
          </div>
        </div>
        <div className="mt-10 flex justify-center">
          <StartLink
            label="Get started for free"
            className="inline-flex h-[62px] items-center gap-2 rounded-[13px] border border-ink bg-lime px-8 font-sans text-lg font-semibold text-ink transition-colors hover:bg-lime-strong"
          />
        </div>
      </Container>
    </GrainSection>
  );
}

const Chip = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-ink px-2 py-0.5 font-mono text-sm text-white">{children}</code>
);

function Feature({ icon, title, children, small }: { icon: Parameters<typeof IconBox>[0]["name"]; title: string; children: ReactNode; small?: boolean }) {
  return (
    <div className="p-10 max-md:p-6">
      <div className="mb-6 flex items-center gap-4">
        <IconBox name={icon} size={small ? "h-10 w-10" : "h-12 w-12"} />
        <h3 className="font-sans text-2xl font-semibold text-ink">{title}</h3>
      </div>
      <div className="font-sans text-base font-light leading-relaxed text-ink/85">{children}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <PlainSection label="How it works" squares={[["37.4%", "95%"], ["86%", "96%"]]}>
      <Container className="py-[100px]">
        <header data-reveal className="mb-14 flex flex-col items-start gap-6">
          <Tag>How it works</Tag>
          <h2 className="l-h2">One space, every account</h2>
          <p className="l-lead max-w-[640px] text-ink/85">
            Whether you are on a laptop, a phone or a library computer, Nebula
            meets you in the browser.
          </p>
        </header>
        <div data-reveal className="relative grid overflow-hidden rounded-[34px] border border-ink bg-vanilla md:grid-cols-2">
          <Feature icon="folder" title="For your files">
            <ul className="list-disc space-y-4 pl-5">
              <li><Chip>drop a folder</Chip> and its structure comes along</li>
              <li>Preview photos, videos, PDFs and text without downloading them first</li>
              <li><Chip>/</Chip> searches every folder at once, accents and all</li>
              <li>Star, rename, move and share, with undo for each</li>
            </ul>
          </Feature>
          <div className="border-ink max-md:border-t md:border-l">
            <Feature icon="shield" title="For your peace of mind">
              <ul className="list-disc space-y-4 pl-5">
                <li>Safe mode keeps a second copy of every file in another account</li>
                <li>Every download is checked against its fingerprint, byte for byte</li>
                <li>Optional encryption: Google only ever stores scrambled bytes</li>
              </ul>
            </Feature>
          </div>
          <div className="border-t border-ink">
            <Feature icon="play" title="Upload anywhere" small>
              Three uploads at a time, each to a different account. Pause, resume
              or cancel any of them, and watch the speed and time left.
            </Feature>
          </div>
          <div className="border-t border-ink md:border-l">
            <Feature icon="undo" title="Undo everything" small>
              Moved the wrong folder? Trashed a file? Every change comes with an
              Undo, and the trash keeps files for 30 days.
            </Feature>
          </div>
        </div>
      </Container>
    </PlainSection>
  );
}

function Tile({ label, mono, color, on = true }: { label: string; mono: string; color: string; on?: boolean }) {
  return (
    <div className="flex w-[74px] flex-col items-center gap-2">
      <div className="relative">
        <div className={`flex h-[68px] w-[73px] items-center justify-center rounded-[13px] border ${on ? "border-ink bg-white" : "border-ink/20 bg-transparent"}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] font-mono text-base font-bold text-ink" style={{ background: color }}>
            {mono}
          </span>
        </div>
        {on && (
          <span className="absolute -right-2 -top-3 flex h-[22px] w-[38px] items-center justify-center rounded-full border border-ink bg-sky text-ink">
            <Glyph name="check" className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <span className="font-sans text-[15px] text-ink">{label}</span>
    </div>
  );
}

export function Stack() {
  const rows = [
    {
      title: "Storage",
      text: "Up to five of your own Google Drives, 15 GB free each",
      tiles: [["Drive 1", "1", "#97d4ff"], ["Drive 2", "2", "#f4ffc9"], ["Drive 3", "3", "#e9ff91"], ["Drive 4", "4", "#ceebff"], ["Drive 5", "5", "#b095fa"]],
    },
    {
      title: "Runs in",
      text: "Any modern browser, nothing to install",
      tiles: [["Chrome", "Ch", "#fd7876"], ["Edge", "Ed", "#97d4ff"], ["Firefox", "Ff", "#ffb57a"], ["Safari", "Sa", "#ceebff"], ["Brave", "Br", "#ffd0c2"]],
    },
    {
      title: "Installs as an app",
      text: "Add it to your home screen or dock; it opens offline",
      tiles: [["Windows", "Wi", "#ceebff"], ["macOS", "Mac", "#e5ded5"], ["Linux", "Lx", "#f4ffc9"], ["Android", "An", "#e9ff91"], ["iPhone", "iOS", "#b095fa"]],
    },
  ];

  return (
    <GrainSection label="Our stack" className="py-20">
      <Container>
        <div data-reveal className="relative grid overflow-hidden rounded-[34px] border border-ink bg-vanilla lg:grid-cols-[577px_1fr]">
          <div className="flex flex-col justify-end gap-6 px-10 pt-16 max-md:px-6">
            <div className="mt-auto flex flex-col gap-6">
              <Tag>Our stack</Tag>
              <h2 className="l-h2">Built on what you have</h2>
              <p className="l-lead text-ink/85">
                No new account, no subscription and no app store. Nebula works with
                the Google accounts and browser you already use.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
            <img src="/art/laptop.svg" alt="Nebby the octopus typing on a laptop on a cloud" className="-mb-px mt-4 w-full max-w-[520px]" />
          </div>
          <div className="border-ink max-lg:border-t lg:border-l">
            {rows.map((row, i) => (
              <div key={row.title} className={`px-8 py-8 max-md:px-6 ${i > 0 ? "border-t border-ink" : ""}`}>
                <h3 className="font-sans text-2xl font-semibold text-ink">{row.title}</h3>
                <p className="mt-2 font-sans text-base text-ink/80">{row.text}</p>
                <div className="mt-6 flex flex-wrap gap-6">
                  {row.tiles.map(([label, mono, color]) => (
                    <Tile key={label} label={label} mono={mono} color={color} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </GrainSection>
  );
}

function Check() {
  return <Glyph name="check" className="mt-1 h-5 w-5 shrink-0" />;
}

export function Modes({ onChoose }: { onChoose: (mode: "private" | "public") => void }) {
  const plans = [
    {
      name: "My device",
      price: "$0",
      text: "For your own laptop or phone",
      items: [
        "The file list is saved here, so it opens instantly",
        "Works offline once installed",
        "Thumbnails and recent files kept on this device",
        "Stays signed out between visits; one click each",
      ],
      action: "My own device",
      mode: "private" as const,
      lime: true,
    },
    {
      name: "Shared PC",
      price: "$0",
      text: "For a library, lab or friend's computer",
      items: [
        "Nothing is saved on the computer",
        "Logs out after 5 idle minutes",
        "Logs out when the tab closes",
        "Only Google's own popup ever asks for your password",
      ],
      action: "Public or shared PC",
      mode: "public" as const,
      lime: false,
    },
  ];

  return (
    <PlainSection id="modes" label="Modes" squares={[["14%", "145px"], ["37.4%", "93%"], ["86%", "95%"]]}>
      <Container className="py-[100px]">
        <div data-reveal className="flex flex-col items-center gap-6 text-center">
          <Tag>Modes</Tag>
          <h2 className="l-h2">Choose your mode</h2>
          <p className="l-lead max-w-[620px] text-ink/85">
            Nebula is free: no plans, no card. Just tell it whose computer this
            is. You can change it later in Settings.
          </p>
        </div>
        <div className="mx-auto mt-14 grid max-w-[776px] gap-8 md:grid-cols-2">
          {plans.map((plan, i) => (
            <div key={plan.name} data-reveal style={{ transitionDelay: `${i * 140}ms` }}
              className="flex flex-col rounded-[34px] border border-ink bg-vanilla p-8 transition-shadow hover:shadow-[8px_8px_0_0_#383838] max-md:p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-mono text-[32px] font-medium text-ink">{plan.name}</h3>
                <span className="font-mono text-[40px] font-bold leading-none text-ink">{plan.price}</span>
              </div>
              <p className="mt-2 font-sans text-sm text-ink/80">{plan.text}</p>
              <div className="my-8 h-[2px] bg-ink" />
              <p className="font-sans text-sm font-medium text-ink">Includes:</p>
              <ul className="mt-5 flex-1 space-y-3">
                {plan.items.map((item) => (
                  <li key={item} className="flex gap-3 font-sans text-lg font-light text-ink">
                    <Check />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => onChoose(plan.mode)}
                className={`mt-10 flex h-14 items-center justify-center gap-2 rounded-[13px] border border-ink font-mono text-lg font-bold text-ink transition-colors ${
                  plan.lime ? "bg-lime hover:bg-lime-strong" : "bg-transparent hover:bg-[#e5ded5]"
                }`}
              >
                {plan.action}
                <Chevron />
              </button>
            </div>
          ))}
        </div>
      </Container>
    </PlainSection>
  );
}

const PROMISES = [
  "Your files never pass through a Nebula server. There isn't one.",
  "Logins live in memory and vanish when the tab closes.",
  "Every download is checked, byte for byte, before you get it.",
];

export function Promises() {
  const [at, setAt] = useState(0);
  const step = (by: number) => setAt((at + by + PROMISES.length) % PROMISES.length);

  return (
    <GrainSection label="Our promise">
      {/* eslint-disable-next-line @next/next/no-img-element -- decoration */}
      <img src="/art/cloud.svg" alt="" className="absolute right-4 top-2 w-[260px] max-md:w-[150px]" />
      {/* eslint-disable-next-line @next/next/no-img-element -- decoration */}
      <img src="/art/cloud.svg" alt="" className="absolute bottom-0 left-4 w-[280px] -scale-x-100 max-md:w-[150px]" />
      <Container className="relative py-[112px]">
        <div data-reveal className="flex flex-col items-center gap-10 text-center">
          <h2 className="font-mono text-6xl font-bold leading-[1.2] text-ink max-md:text-4xl">Built on a promise</h2>
          <p className="max-w-[540px] font-sans text-lg font-light text-ink">
            Nebula is built for people who want more space without handing their
            files to someone new. Three things it will always do:
          </p>
          <div className="flex w-full items-center justify-between gap-6">
            <button aria-label="Previous promise" onClick={() => step(-1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center border border-ink bg-lime text-ink hover:bg-lime-strong">
              <Arrow className="h-4 w-4 rotate-180" />
            </button>
            <figure aria-live="polite" className="mx-auto max-w-[760px]">
              <blockquote className="font-mono text-[32px] font-medium leading-snug text-ink max-md:text-xl">
                “{PROMISES[at]}”
              </blockquote>
              <figcaption className="mt-8 flex items-center justify-center gap-3 font-sans text-sm text-ink/70">
                <Logo className="h-12 w-12" />
                <span className="text-left">
                  <span className="block font-semibold text-ink">The Nebula promise</span>
                  {at + 1} of {PROMISES.length}
                </span>
              </figcaption>
            </figure>
            <button aria-label="Next promise" onClick={() => step(1)}
              className="flex h-12 w-12 shrink-0 items-center justify-center border border-ink bg-lime text-ink hover:bg-lime-strong">
              <Arrow className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Container>
    </GrainSection>
  );
}

export function Security() {
  const rows = [
    {
      icon: "lock",
      title: "Encrypted in your browser",
      text: "Turn on encryption and files are scrambled with AES-256 before they leave this device. Your passphrase never leaves it at all.",
    },
    {
      icon: "server",
      title: "No Nebula server",
      text: "There is no Nebula database or upload server. Files go from your browser straight to your own Google accounts.",
    },
    {
      icon: "check",
      title: "Only the files Nebula made",
      text: "Google lets Nebula see only the files it uploaded, plus its own file list. The rest of your Drive stays out of reach.",
    },
  ] as const;

  return (
    <PlainSection id="security" label="Security" squares={[["14%", "88px"], ["37.4%", "94%"], ["86%", "95%"]]}>
      <Container className="py-[100px]">
        <div data-reveal className="relative grid overflow-hidden rounded-[34px] border border-ink bg-vanilla md:grid-cols-[573px_1fr]">
          <div className="flex flex-col gap-6 p-10 max-md:p-6">
            <Tag>Security</Tag>
            <h2 className="font-mono text-6xl font-bold leading-[1.1] text-ink max-md:text-4xl">
              Your files, handled with care
            </h2>
            <p className="l-lead text-ink/85">
              No shortcuts and no middleman. Your files are protected by design,
              not by a promise in small print.
            </p>
            <Link href="/privacy/" className="flex items-center gap-2 font-sans text-base font-semibold text-ink hover:underline">
              Read the privacy policy <Arrow className="h-4 w-4" />
            </Link>
          </div>
          <div className="border-ink max-md:border-t md:border-l">
            {rows.map((row, i) => (
              <div key={row.title} className={`flex gap-6 p-8 max-md:p-6 ${i > 0 ? "border-t border-ink" : ""}`}>
                <IconBox name={row.icon} />
                <div>
                  <h3 className="font-sans text-[22px] font-semibold text-ink">{row.title}</h3>
                  <p className="mt-2 font-sans text-base font-light text-ink/85">{row.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </PlainSection>
  );
}

const FAQS = [
  ["Is Nebula really free?", "Yes. Nebula has no server to pay for: it runs in your browser and stores files in your own Google accounts, using the free space they already come with."],
  ["Where are my files stored?", "In a folder called Nebula in your own Google Drive accounts. Nebula keeps a small list of which file is where in a hidden app folder in each account, so any of them can bring the whole list back on a new device."],
  ["Can Nebula see the rest of my Drive?", "No. Google only lets Nebula see the files it uploaded itself. Your other documents, photos and mail stay out of reach."],
  ["What happens if one account is full or I want to remove it?", "New files go to accounts with room. To retire an account, Nebula can move everything stored in it to your other accounts, checking every byte before deleting anything."],
  ["Is it safe on a shared computer?", "Choose Public or shared PC mode. Nothing is saved on the computer, and you are logged out after five idle minutes or when the tab closes."],
  ["What if I forget my encryption passphrase?", "Then encrypted files cannot be opened, by anyone, including us. Encryption is optional; if you turn it on, write the passphrase down somewhere safe."],
  ["Does it work on my phone?", "Yes. Nebula works in mobile browsers and can be installed to your home screen like an app."],
] as const;

export function Faq() {
  return (
    <GrainSection id="faq" label="FAQ">
      <Container className="py-[100px]">
        <div data-reveal className="mb-12 flex flex-col items-center gap-6 text-center">
          <Tag>FAQ</Tag>
          <h2 className="l-h2">Have questions? We&apos;ve got answers!</h2>
        </div>
        <div data-reveal className="border-t-2 border-ink">
          {FAQS.map(([question, answer], i) => (
            <details key={question} open={i === 0} className="group border-b-2 border-ink py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-sans text-[22px] font-semibold text-ink max-md:text-lg [&::-webkit-details-marker]:hidden">
                {question}
                <Chevron className="h-4 w-4 shrink-0 rotate-90 transition-transform group-open:-rotate-90" />
              </summary>
              <p className="mt-4 font-sans text-[22px] font-light leading-relaxed text-ink max-md:text-lg">{answer}</p>
            </details>
          ))}
        </div>
      </Container>
    </GrainSection>
  );
}

export function CallToAction() {
  return (
    <PlainSection label="Get started" squares={[["14%", "80px"], ["37.4%", "95%"], ["86%", "96%"]]}>
      <Container className="py-[90px]">
        <div data-reveal className="relative mx-auto max-w-[1017px]">
          {/* The blue sheet behind the window. */}
          <div className="grain absolute -bottom-5 -left-5 right-5 top-5 rounded-[26px] bg-[#058bff]" aria-hidden />
          <div className="relative overflow-hidden rounded-[22px] border border-ink bg-[linear-gradient(180deg,#f6f2ee_60%,#eceaea)]">
            <div className="flex h-[50px] items-center justify-end gap-5 border-b border-ink px-8 text-ink" aria-hidden>
              <Glyph name="minus" />
              <Glyph name="close" />
              <Glyph name="square" />
            </div>
            <div className="flex flex-col items-center justify-between gap-6 p-14 max-md:p-6 md:flex-row">
              <div className="z-10 flex flex-col gap-6">
                <h2 className="font-sans text-[40px] font-semibold leading-[1.1] text-ink max-md:text-3xl">Start pooling today!</h2>
                <p className="font-sans text-[22px] font-light text-ink max-md:text-lg">
                  Free forever. No credit card, no new account.
                </p>
                <div className="flex flex-wrap gap-6">
                  <StartLink />
                  <Link href="/faq/" className="l-btn l-btn-plain">Read the FAQ</Link>
                </div>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
              <img src="/art/crew.svg" alt="Three octopuses: lavender with a scarf, blue with headphones, pink with glasses"
                className="w-[460px] max-w-full md:-mb-14 md:-mr-6" />
            </div>
          </div>
        </div>
      </Container>
    </PlainSection>
  );
}
