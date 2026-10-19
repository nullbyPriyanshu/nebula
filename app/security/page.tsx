import type { Metadata } from "next";
import { CallToAction, Security } from "@/components/landing/sections";

export const metadata: Metadata = { title: "Security · Nebula" };

export default function SecurityPage() {
  return (
    <>
      <Security />
      <CallToAction />
    </>
  );
}
