import type { Metadata } from "next";
import { CallToAction, Faq } from "@/components/landing/sections";

export const metadata: Metadata = { title: "FAQ · Nebula" };

export default function FaqPage() {
  return (
    <>
      <Faq />
      <CallToAction />
    </>
  );
}
