import * as React from "react"

const MOBILE_BREAKPOINT = 768

const TOUCH_QUERY = "(pointer: coarse)"

/**
 * True on touch-first devices, however wide they are. A tablet is not
 * "mobile" in the layout sense but still needs swipes and on-screen pads, so
 * the game branches on this rather than on a width breakpoint.
 */
export function useIsTouch() {
  const [isTouch, setIsTouch] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(TOUCH_QUERY).matches,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(TOUCH_QUERY)
    const onChange = () => setIsTouch(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isTouch
}

export function useIsMobile() {
  // Read the viewport once at mount rather than writing state from the effect
  // body: the value is right on the first render, and the subscription below
  // then only fires on a real change.
  const [isMobile, setIsMobile] = React.useState<boolean>(() =>
    typeof window === "undefined" ? false : window.innerWidth < MOBILE_BREAKPOINT,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
