'use client'

import { useEffect, useState } from 'react'

/**
 * Returns a timestamp (ms) that updates on an interval, forcing re-render of
 * any component that consumes it. Use it to keep relative times ("hace 5s",
 * elapsed counters, etc.) ticking without a page reload.
 *
 * The setState happens inside the interval callback (not in the effect body),
 * so it complies with the react-hooks/set-state-in-effect lint rule.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
