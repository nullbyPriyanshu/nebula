import Link from "next/link";
import { Container, GrainSection, Logo } from "@/components/landing/parts";

export function SiteFooter({ started }: { started: boolean }) {
  return (
    <GrainSection label="Footer" className="border-t border-ink/10">
      <Container className="pb-24 pt-16">
        <div className="relative grid gap-10 md:grid-cols-[1fr_auto_auto_1.4fr]">
          <Link href="/" className="flex items-center gap-2 self-start font-sans text-[28px] text-ink">
            <Logo className="h-8 w-8" /> Nebula
          </Link>
          <nav aria-label="Product" className="flex flex-col gap-4 font-sans text-xl font-light text-ink md:pr-20">
            <span className="font-semibold">Product</span>
            <Link href="/" className="hover:underline">Home</Link>
            {started && <Link href="/files/" className="hover:underline">My files</Link>}
            <Link href="/#features" className="hover:underline">Features</Link>
            {started ? (
              <Link href="/accounts/" className="hover:underline">Accounts</Link>
            ) : (
              <Link href="/#modes" className="hover:underline">Choose a mode</Link>
            )}
          </nav>
          <nav aria-label="Learn" className="flex flex-col gap-4 font-sans text-xl font-light text-ink">
            <span className="font-semibold">Learn</span>
            <Link href="/faq/" className="hover:underline">FAQ</Link>
            <Link href="/security/" className="hover:underline">Security</Link>
            <Link href="/privacy/" className="hover:underline">Privacy policy</Link>
          </nav>
          {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG illustration */}
          <img src="/art/peek.svg" alt="" className="-mb-[3.4rem] w-[420px] max-w-full self-end justify-self-end max-md:hidden" />
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-ink pt-10 font-sans text-xl font-light text-ink max-md:text-base">
          <p className="flex flex-wrap gap-x-6 gap-y-2">
            <span>© 2026 Nebula. Your files, your accounts.</span>
            <Link href="/privacy/" className="underline underline-offset-4">Privacy Policy</Link>
          </p>
          <Link href="/faq/" className="font-mono text-base font-semibold uppercase">Need help? →</Link>
        </div>
      </Container>
    </GrainSection>
  );
}
