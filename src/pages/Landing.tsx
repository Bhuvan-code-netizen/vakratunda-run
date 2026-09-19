import { motion } from "framer-motion";
import { ChevronRight, Gamepad2, Keyboard, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    title: "Three Lanes, One Rhythm",
    desc: "Hold the center or cut across the traffic. Every lane change is a decision, and the pace only ever rises.",
  },
  {
    title: "A City Dressed for the Festival",
    desc: "Marigold torans over the road, windows warming as the sun drops, and the evening glow of a neighbourhood celebrating.",
  },
  {
    title: "The Run Never Ends",
    desc: "There is no finish line and no second player. Only the road, the speed, and the score you leave behind you.",
  },
];

export default function Landing() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="relative min-h-screen overflow-hidden bg-[#0b0712] text-amber-50"
    >
      {/* Ambient festival glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-amber-600/15 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-orange-700/10 blur-[100px]"
      />

      <div className="relative mx-auto flex max-w-5xl flex-col items-center px-6 pb-24 pt-28 text-center">
        {/* Om glyph */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.6 }}
          className="mb-6 flex size-20 items-center justify-center rounded-full border border-amber-300/30 bg-gradient-to-b from-amber-500/20 to-transparent text-4xl text-amber-300 shadow-[0_0_60px_rgba(212,160,23,0.25)]"
        >
          ॐ
        </motion.div>

        <div className="mb-4 text-[11px] tracking-[0.5em] text-amber-300/70">
          GANAPATI BAPPA MORIYA
        </div>

        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="bg-gradient-to-b from-amber-100 via-amber-300 to-amber-600 bg-clip-text font-[Cinzel,Georgia,serif] text-6xl font-bold leading-[1.05] tracking-[0.08em] text-transparent sm:text-8xl"
        >
          VAKRATUNDA
          <br />
          RUN
        </motion.h1>

        <motion.p
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-6 max-w-xl font-[Rajdhani,system-ui,sans-serif] text-lg leading-7 text-amber-50/60"
        >
          A cinematic endless run through a city lit for Ganesh Chaturthi.
          Three lanes, rising speed, and a distance that belongs to you alone.
        </motion.p>

        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.6 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
        >
          <Button
            asChild
            size="lg"
            className="cursor-pointer rounded-full border border-amber-300/40 bg-gradient-to-b from-amber-400 to-amber-700 px-10 text-base font-bold tracking-[0.2em] text-amber-950 shadow-[0_0_50px_rgba(212,160,23,0.35)] transition-transform hover:scale-[1.03]"
          >
            <Link to="/play">
              PLAY NOW <ChevronRight className="ml-1 size-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4 text-[10px] tracking-[0.3em] text-white/35">
            <span className="flex items-center gap-1.5">
              <Keyboard className="size-3.5" /> KEYBOARD
            </span>
            <span className="flex items-center gap-1.5">
              <Gamepad2 className="size-3.5" /> TOUCH
            </span>
          </div>
        </motion.div>

        {/* Feature cards */}
        <div className="mt-24 grid w-full gap-5 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ y: 24, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 * i, duration: 0.5 }}
              className="rounded-xl border border-amber-200/10 bg-white/[0.03] p-6 text-left backdrop-blur-sm transition-colors hover:border-amber-300/25"
            >
              <Sparkles className="mb-3 size-5 text-amber-400/80" />
              <h3 className="font-[Cinzel,Georgia,serif] text-lg font-semibold tracking-wide text-amber-100">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-white/50">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="mt-20 text-[10px] tracking-[0.4em] text-white/25">
          VAKRATUNDA RUN — FIRST MILESTONE
        </div>
      </div>
    </motion.div>
  );
}
