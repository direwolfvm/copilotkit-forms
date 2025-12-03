import { useMemo } from "react"

type Snowflake = {
  id: number
  left: number
  duration: number
  delay: number
  size: number
  opacity: number
}

function createSnowflakes(count: number): Snowflake[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    duration: 8 + Math.random() * 8,
    delay: Math.random() * 6,
    size: 1 + Math.random() * 0.8,
    opacity: 0.45 + Math.random() * 0.45
  }))
}

export default function Snowfall() {
  const snowflakes = useMemo(() => createSnowflakes(42), [])

  return (
    <div className="snowfall" aria-hidden="true">
      {snowflakes.map((flake) => (
        <span
          key={flake.id}
          className="snowfall__flake"
          style={{
            left: `${flake.left}%`,
            animationDuration: `${flake.duration}s`,
            animationDelay: `${flake.delay}s`,
            fontSize: `${flake.size}rem`,
            opacity: flake.opacity
          }}
        >
          ❄️
        </span>
      ))}
    </div>
  )
}
