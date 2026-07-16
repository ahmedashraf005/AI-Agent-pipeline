import { useEffect, useRef, useState } from 'react'

export function useCountUp(targetValue, durationMs = 500) {
  const [displayValue, setDisplayValue] = useState(targetValue)
  const frameRef = useRef(null)
  const startValueRef = useRef(targetValue)

  useEffect(() => {
    const startValue = startValueRef.current
    const startTime = performance.now()

    function tick(now) {
      const progress = Math.min((now - startTime) / durationMs, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (targetValue - startValue) * eased
      setDisplayValue(current)

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        startValueRef.current = targetValue
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [targetValue, durationMs])

  return displayValue
}
