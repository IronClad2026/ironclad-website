"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  sectionReveal,
  sectionRevealTransition,
  sectionRevealViewport,
} from "@/lib/animations";
import styles from "./ScrollReveal.module.css";

type ScrollRevealProps = {
  children: ReactNode;
  className?: string;
};

export default function ScrollReveal({
  children,
  className,
}: ScrollRevealProps) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={sectionRevealViewport}
      variants={sectionReveal}
      transition={sectionRevealTransition}
      className={`${styles.reveal}${className ? ` ${className}` : ""}`}
    >
      {children}
    </motion.div>
  );
}
