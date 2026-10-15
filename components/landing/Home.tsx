"use client";

import { useRouter } from "next/navigation";
import { chooseMode } from "@/lib/nebula-store";
import { Audience, CallToAction, Hero, HowItWorks, Modes, OneSpace, Stack } from "./sections";

// The landing page: the whole tour of Nebula, ending in choosing a mode,
// which opens My files.
export function Home() {
  const router = useRouter();

  const choose = async (mode: "private" | "public") => {
    await chooseMode(mode);
    router.push("/files/");
  };

  return (
    <>
      <Hero />
      <OneSpace />
      <Audience />
      <HowItWorks />
      <Stack />
      <Modes onChoose={choose} />
      <CallToAction />
    </>
  );
}
