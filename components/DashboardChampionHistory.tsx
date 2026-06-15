"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Crown, Trophy } from "lucide-react";
import type { ChampionAchievement } from "@/lib/player-dashboard";

const EMBERS = Array.from({ length: 18 }, (_, index) => ({
  left: `${4 + ((index * 19) % 92)}%`,
  delay: (index % 7) * 0.32,
  duration: 2.8 + (index % 5) * 0.35,
  size: 2 + (index % 3),
}));

export default function DashboardChampionHistory({
  champions,
}: {
  champions: ChampionAchievement[];
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section className="mt-10">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-orange-400">
          <Crown size={15} />
          Victory Archive
        </p>
        <h2 className="mt-3 text-3xl font-bold text-white">
          Tournament Champions
        </h2>
      </div>

      {champions.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-orange-400/20 bg-orange-500/[0.03] p-6 text-sm text-zinc-500">
          Tournament victories will be permanently displayed here.
        </div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          {champions.map((champion) => (
            <motion.article
              key={champion.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -3, scale: 1.005 }}
              className="group relative min-h-72 overflow-hidden rounded-3xl border border-orange-300/45 bg-[#130b06] bg-cover bg-center shadow-[0_0_35px_rgba(249,115,22,0.22),inset_0_0_45px_rgba(249,115,22,0.05)]"
              style={
                champion.bannerImageUrl
                  ? {
                      backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.96), rgba(0,0,0,0.58)), url(${JSON.stringify(
                        champion.bannerImageUrl
                      )})`,
                    }
                  : undefined
              }
            >
              <motion.div
                className="absolute -inset-1 rounded-[28px] bg-[conic-gradient(from_90deg,transparent,rgba(249,115,22,0.7),transparent,rgba(251,191,36,0.45),transparent)] opacity-55 blur-xl"
                animate={reduceMotion ? undefined : { rotate: 360 }}
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        duration: 14,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "linear",
                      }
                }
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(251,146,60,0.28),transparent_25%),radial-gradient(circle_at_15%_100%,rgba(194,65,12,0.32),transparent_35%)]" />
              <motion.div
                className="absolute inset-y-0 left-[-35%] w-1/3 skew-x-[-18deg] bg-gradient-to-r from-transparent via-orange-200/15 to-transparent blur-md"
                animate={reduceMotion ? undefined : { x: ["0%", "430%"] }}
                transition={
                  reduceMotion
                    ? undefined
                    : {
                        duration: 4.5,
                        repeat: Number.POSITIVE_INFINITY,
                        repeatDelay: 2,
                        ease: "easeInOut",
                      }
                }
              />

              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {EMBERS.map((ember, index) => (
                  <motion.span
                    key={`${champion.id}-ember-${index}`}
                    className="absolute bottom-[-8px] rounded-full bg-orange-300 shadow-[0_0_10px_rgba(251,146,60,0.9)]"
                    style={{
                      left: ember.left,
                      width: ember.size,
                      height: ember.size,
                    }}
                    animate={
                      reduceMotion
                        ? undefined
                        : {
                            y: [0, -230],
                            x: [0, index % 2 === 0 ? 18 : -14],
                            opacity: [0, 0.9, 0],
                          }
                    }
                    transition={
                      reduceMotion
                        ? undefined
                        : {
                            duration: ember.duration,
                            delay: ember.delay,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "easeOut",
                          }
                    }
                  />
                ))}
              </div>

              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-orange-950/40 to-transparent" />
              <div className="relative z-10 flex min-h-72 flex-col justify-end p-7 sm:p-8">
                <motion.span
                  className="mb-auto grid h-14 w-14 place-items-center rounded-full border border-orange-200/50 bg-orange-500/15 text-orange-100 shadow-[0_0_35px_rgba(249,115,22,0.4)] backdrop-blur"
                  animate={
                    reduceMotion
                      ? undefined
                      : {
                          boxShadow: [
                            "0 0 24px rgba(249,115,22,0.3)",
                            "0 0 42px rgba(251,146,60,0.62)",
                            "0 0 24px rgba(249,115,22,0.3)",
                          ],
                        }
                  }
                  transition={
                    reduceMotion
                      ? undefined
                      : {
                          duration: 2.4,
                          repeat: Number.POSITIVE_INFINITY,
                        }
                  }
                >
                  <Trophy size={27} />
                </motion.span>

                <p className="text-xs font-black uppercase tracking-[0.34em] text-orange-300 drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                  Tournament Champion
                </p>
                <h3 className="mt-3 text-3xl font-black text-white drop-shadow-[0_3px_12px_rgba(0,0,0,1)]">
                  {champion.winnerName}
                </h3>
                <p className="mt-2 text-xl font-black text-orange-100 drop-shadow-[0_3px_12px_rgba(0,0,0,1)]">
                  {champion.tournamentName}
                </p>
                <p className="mt-3 text-xs font-bold uppercase tracking-wider text-zinc-300 drop-shadow-[0_2px_8px_rgba(0,0,0,1)]">
                  {champion.bracketName} Bracket · Won{" "}
                  {formatDate(champion.wonAt)}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}
