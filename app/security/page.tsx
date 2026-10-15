import type { Metadata } from "next";
import { Promises, Security } from "@/components/landing/sections";

export const metadata: Metadata = { title: "Security · Nebula" };

export default function SecurityPage() {
  return (
    <>
      <Security />
      <Promises />
    </>
  );
}
