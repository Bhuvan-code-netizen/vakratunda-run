import { motion } from "framer-motion";
import { ChevronUp, MoveLeft, MoveRight } from "lucide-react";
import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import type { InputAction } from "@/game/core/InputController";
import { useIsTouch } from "@/hooks/use-mobile";

export interface TouchControlsProps {
  /** Feed the engine a semantic action; the pads never touch the DOM game state. */
  onAction: (action: InputAction) => void;
  /** Hidden during the cinematic intro and while the run is over. */
  visible: boolean;
}

interface PadProps {
  action: InputAction;
  label: string;
  icon: typeof MoveLeft;
  big?: boolean;
  onPress: (action: InputAction) => (e: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * One pad. The press fires on pointer-down rather than click: waiting for the
 * finger to lift — or for the mobile click delay — means a lane change lands
 * after the obstacle it was meant to dodge.
 */
function Pad({ action, label, icon: Icon, big, onPress }: PadProps) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 700, damping: 28 }}
      onPointerDown={onPress(action)}
      onContextMenu={(e) => e.preventDefault()}
      className={`game-pad flex select-none flex-col items-center justify-center gap-0.5 border border-amber-200/25 bg-black/40 text-amber-100/90 backdrop-blur-md active:border-amber-200/60 active:bg-amber-400/20 ${
        // One radius utility per branch: two of them in one className would
        // leave the circle/rounded choice to stylesheet order.
        big ? "size-20 rounded-full" : "size-16 rounded-2xl"
      }`}
    >
      <Icon className={big ? "size-7" : "size-6"} strokeWidth={2.2} />
      <span className="text-[8px] font-semibold tracking-[0.18em] text-amber-200/70">
        {label}
      </span>
    </motion.button>
  );
}

/**
 * Swipe is the primary way to play on a phone, but a pad you can see beats a
 * gesture you have to remember — so both are always live. The pads are only
 * rendered on touch devices, and they are marked as interactive so a press
 * here is never also read as a swipe by the engine.
 */
export function TouchControls({ onAction, visible }: TouchControlsProps) {
  const isTouch = useIsTouch();

  const press = useCallback(
    (action: InputAction) => (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      // The engine owns the feedback (haptics included), so pressing a pad
      // here never buzzes twice for the same lane change.
      onAction(action);
    },
    [onAction],
  );

  if (!isTouch || !visible) return null;

  return (
    <>
      <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-24 z-10 text-center text-[9px] tracking-[0.32em] text-white/25">
        SWIPE — OR USE THE PADS
      </div>
      <div className="safe-bottom safe-x pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between pb-4">
        <div className="pointer-events-auto flex items-end gap-3">
          <Pad action="left" label="LEFT" icon={MoveLeft} onPress={press} />
          <Pad action="right" label="RIGHT" icon={MoveRight} onPress={press} />
        </div>
        <div className="pointer-events-auto">
          <Pad action="jump" label="JUMP" icon={ChevronUp} big onPress={press} />
        </div>
      </div>
    </>
  );
}
