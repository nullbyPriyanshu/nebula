import Link from "next/link";
import { Container, GrainSection, Logo } from "@/components/landing/parts";

// One slim band: the mark, the links in a row, the copyright.
export function SiteFooter() {
  const links = [
    { href: "/#features", label: "How it works" },
    { href: "/security/", label: "Security" },
    { href: "/faq/", label: "FAQ" },
    { href: "/privacy/", label: "Privacy" },
  ];

  return (
    <GrainSection label="Footer" className="border-t border-ink/15">
      <Container className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4 py-7">
        <Link href="/" className="flex items-center gap-2 font-sans text-xl text-ink">
          <Logo className="h-6 w-6" />
          <span className="font-mono text-lg font-bold tracking-tight">Nebula</span>
          <span className="hidden font-light text-ink/60 sm:inline">· Your files, your accounts</span>
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 font-sans text-base text-ink/80">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink hover:underline underline-offset-4">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="font-mono text-sm text-ink/60">© 2026 Nebula</p>
      </Container>
    </GrainSection>
  );
}
