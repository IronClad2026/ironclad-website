"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function PageHero({
  eyebrow,
  title,
  description,
}: PageHeroProps) {
  return (
    <section
      className="relative flex min-h-screen items-center justify-center bg-contain bg-center bg-no-repeat px-6 text-center"
      style={{
        backgroundImage: "url('/images/ironclad-background.jpg')",
      }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <motion.div
        initial="hidden"
        animate="visible"
        variants={fadeUp}
        transition={{ duration: 0.7 }}
        className="relative z-10 max-w-5xl"
      >
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-300">
          {eyebrow}
        </p>

        <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-7xl">
          {title}
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-zinc-200">
          {description}
        </p>
      </motion.div>
    </section>
  );
}