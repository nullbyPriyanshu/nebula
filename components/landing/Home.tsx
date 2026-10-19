"use client";

import { useRouter } from "next/navigation";
import { chooseMode } from "@/lib/nebula-store";
import { Figures, Hero, Modes, PromiseBand, Steps } from "./sections";

// The landing page: what Nebula is, what it promises, the figures, three
// steps, then choosing a mode, which opens My files.
export function Home() {
  const router = useRouter();

  const choose = async (mode: "private" | "public") => {
    await chooseMode(mode);
    router.push("/files/");
  };

  return (
    <>
      <Hero />
      <PromiseBand />
      <Figures />
      <Steps />
      <Modes onChoose={choose} />
    </>
  );
}
