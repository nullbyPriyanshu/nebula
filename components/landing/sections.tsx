"use client";

import Link from "next/link";
import { preload } from "react-dom";
import { useNebula } from "@/context/NebulaContext";
import {
  Arrow,
  Chevron,
  Container,
  Glyph,
  GrainSection,
  IconBox,
  PlainSection,
  Tag,
} from "./parts";

// The sections of the public pages, in the style of the site: grain and
// plain bands, charcoal outlines, lime buttons.

// The main call to action: start (choose a mode) on a first visit, or go
// straight to the files once a mode is chosen.
export function StartLink({
  className = "l-btn l-btn-lime",
  label,
  id,
}: {
  className?: string;
  label?: string;
  id?: string;
}) {
  const { mode } = useNebula();
  const started = mode === "private" || mode === "public";

  // Invisible (but holding its place) until the saved mode is read, so the
  // label never switches from "Start free" to "Open my files" on screen.
  return (
    <Link
      id={id}
      href={started ? "/files/" : "/#modes"}
      aria-hidden={mode === "loading"}
      className={`${className} ${mode === "loading" ? "invisible" : ""}`}
    >
      {started ? "Open my files" : (label ?? "Start free")} <Arrow />
    </Link>
  );
}

// The hero card is a sheet of paper with its top-right corner folded over.
export function Hero() {
  // Fetched with the page, so the mascot does not pop in afterwards.
  preload("/art/hero.svg", { as: "image", fetchPriority: "high" });

  return (
    <GrainSection id="top" label="Introduction" className="pb-12">
      <Container className="relative flex flex-col items-center pt-16 max-md:pt-8">
        <div className="relative mx-auto w-full max-w-[1079px]">
          <div
            data-reveal
            className="relative min-h-[540px] rounded-[20px] border-2 border-ink bg-vanilla text-ink max-lg:min-h-0"
            style={{ clipPath: "polygon(0 0, calc(100% - 118px) 0, 100% 101px, 100% 100%, 0 100%)" }}
          >
            <div className="relative z-10 flex min-h-[536px] flex-col justify-center gap-7 px-12 py-12 max-lg:min-h-0 max-md:px-6 max-md:pt-[110px] lg:max-w-[600px]">
              <h1 className="font-mono text-[60px] font-bold leading-[1.1] max-[1400px]:text-[54px] max-[1200px]:text-[48px] max-md:text-[34px]">
                One drive, <br className="max-md:hidden" />every account
              </h1>
              <p className="max-w-[440px] font-sans text-2xl font-normal leading-[1.4] max-[1200px]:text-xl">
                Pool the free 15 GB of up to five Google accounts into one space.
                Files go straight from your browser to your own Drive.
              </p>
              <div>
                <StartLink id="hero-start" />
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
            className="pointer-events-none absolute bottom-[2px] right-[2px] w-[470px] max-[1200px]:w-[420px] max-lg:hidden"
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
      <div className="mt-14 text-center">
        <h2 className="mb-8 font-mono text-xl font-medium text-ink">Works wherever you do</h2>
        <div className="relative w-full overflow-hidden">
          <div className="marquee flex w-max items-center gap-16">
            {[0, 1].map((copy) =>
              ["Google Drive", "Chrome", "Edge", "Firefox", "Safari", "Android", "iPhone", "Windows", "macOS", "Linux"].map((name) => (
                <span key={`${copy}-${name}`} aria-hidden={copy === 1}
                  className="font-sans text-[32px] font-bold tracking-tight text-[#58534f] opacity-80 max-md:text-2xl">
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

const STEPS = [
  {
    icon: "user",
    title: "Connect your accounts",
    text: "Sign in with up to five Google accounts. Their free 15 GB each adds up into one pool.",
  },
  {
    icon: "folder",
    title: "Drop in your files",
    text: "Upload files or whole folders. Nebula picks an account with room, and can keep a second copy.",
  },
  {
    icon: "shield",
    title: "Open them anywhere",
    text: "Preview, search and share from any browser. Every download is checked byte for byte.",
  },
] as const;

// Three steps on a line, numbered like a timeline.
export function Steps() {
  return (
    <PlainSection id="features" label="How it works" squares={[["14%", "110px"], ["86%", "85%"]]}>
      <Container className="py-20 max-md:py-12">
        <div data-reveal className="mb-14 flex flex-col items-center gap-5 text-center">
          <Tag>How it works</Tag>
          <h2 className="l-h2">Three steps to more space</h2>
        </div>
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          {/* The line joining the numbers. */}
          <span aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-px bg-ink md:block" />
          {STEPS.map((step, i) => (
            <li key={step.title} data-reveal style={{ transitionDelay: `${i * 120}ms` }}
              className="relative flex flex-col items-center gap-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-ink bg-lime font-mono text-xl font-bold text-ink">
                {i + 1}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-ink/60"><Glyph name={step.icon} /></span>
                <h3 className="font-sans text-2xl font-semibold text-ink">{step.title}</h3>
              </div>
              <p className="max-w-[320px] font-sans text-lg font-light leading-relaxed text-ink/80">{step.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </PlainSection>
  );
}

const PROMISE = [
  {
    icon: "server",
    title: "No middleman",
    text: "Your files never pass through a Nebula server. There isn't one.",
    note: "Browser to your own Google accounts, directly.",
  },
  {
    icon: "lock",
    title: "Nothing remembered",
    text: "Logins live in memory and vanish when the tab closes.",
    note: "Encrypt files with your own passphrase, if you like.",
  },
  {
    icon: "check",
    title: "Nothing altered",
    text: "Every download is checked, byte for byte, before you get it.",
    note: "A damaged copy is refused, and the safe copy used.",
  },
] as const;

// The three commitments, right under the hero.
export function PromiseBand() {
  return (
    <PlainSection label="Our promise" squares={[["37.4%", "60px"], ["86%", "40%"]]}>
      <Container className="py-20 max-md:py-12">
        <div data-reveal className="mx-auto mb-14 flex max-w-[720px] flex-col items-center gap-5 text-center">
          <Tag>Our promise</Tag>
          <h2 className="font-mono text-[52px] font-bold leading-[1.1] text-ink max-[1200px]:text-[44px] max-md:text-[32px]">
            Built on a promise
          </h2>
          <p className="l-lead text-ink/80">
            More space without handing your files to someone new. Three things
            Nebula will always do:
          </p>
        </div>
        <div className="grid overflow-hidden rounded-[34px] border border-ink bg-vanilla md:grid-cols-3 max-md:rounded-[24px]">
          {PROMISE.map((item, i) => (
            <figure key={item.title} data-reveal style={{ transitionDelay: `${i * 120}ms` }}
              className={`flex flex-col gap-5 p-8 max-md:p-6 ${i > 0 ? "border-ink max-md:border-t md:border-l" : ""}`}>
              <div className="flex items-center justify-between">
                <IconBox name={item.icon} />
                <span aria-hidden className="font-mono text-6xl font-bold leading-none text-lime-strong [-webkit-text-stroke:1.5px_#383838]">”</span>
              </div>
              <h3 className="font-sans text-sm font-semibold uppercase tracking-widest text-ink/60">{item.title}</h3>
              <blockquote className="font-mono text-[22px] font-medium leading-snug text-ink">{item.text}</blockquote>
              <figcaption className="mt-auto border-t border-ink/15 pt-4 font-sans text-base font-light text-ink/75">{item.note}</figcaption>
            </figure>
          ))}
        </div>
      </Container>
    </PlainSection>
  );
}

// The key figures, on a grain band.
export function Figures() {
  const figures = [
    ["75 GB", "free storage", "with five Google accounts"],
    ["0", "servers in between", "nothing to trust but Google"],
    ["AES-256", "optional encryption", "in your browser"],
    ["30 days", "to undo a delete", "plus undo for every change"],
  ];

  return (
    <GrainSection label="In numbers">
      <Container className="py-16 max-md:py-10">
        <div data-reveal className="grid grid-cols-2 gap-px overflow-hidden rounded-[24px] border border-ink bg-ink lg:grid-cols-4">
          {figures.map(([value, label, note]) => (
            <div key={label} className="flex flex-col items-center gap-1 bg-vanilla px-4 py-8 text-center max-md:py-6">
              <span className="font-mono text-[44px] font-bold leading-tight text-ink max-md:text-[28px]">{value}</span>
              <span className="font-sans text-base font-semibold text-ink">{label}</span>
              <span className="font-sans text-sm font-light text-ink/60">{note}</span>
            </div>
          ))}
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
              className="flex flex-col rounded-[34px] border border-ink bg-vanilla p-8 max-md:p-6">
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
                className={`press mt-10 flex h-14 items-center justify-center gap-2 rounded-[13px] border border-ink font-mono text-lg font-bold text-ink ${
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
