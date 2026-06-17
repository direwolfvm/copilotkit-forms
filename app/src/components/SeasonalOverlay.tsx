import { useMemo } from "react"
import type { SeasonalTheme } from "../holidayThemeContext"

type ActiveSeasonalTheme = Exclude<SeasonalTheme, "none">

type Particle = {
  id: number
  left: number
  duration: number
  delay: number
  size: number
  opacity: number
  glyph: string
}

// Each active theme falls with its own mix of glyphs and a particle count that
// keeps the effect playful without overwhelming the page.
const THEME_GLYPHS: Record<ActiveSeasonalTheme, string[]> = {
  christmas: ["❄️", "❄️", "❄️", "🎄", "⛄"],
  july4: ["🎆", "🎇", "⭐", "🇺🇸", "✨", "🔵", "🔴"],
  unicorn: ["🦄", "✨", "💖", "🌈", "⭐", "💜", "🩷"]
}

const THEME_PARTICLE_COUNT: Record<ActiveSeasonalTheme, number> = {
  christmas: 42,
  july4: 36,
  unicorn: 38
}

function createParticles(count: number, glyphs: string[]): Particle[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    left: Math.random() * 100,
    duration: 8 + Math.random() * 8,
    delay: Math.random() * 6,
    size: 1 + Math.random() * 0.8,
    opacity: 0.45 + Math.random() * 0.45,
    glyph: glyphs[Math.floor(Math.random() * glyphs.length)]
  }))
}

export default function SeasonalOverlay({ theme }: { theme: ActiveSeasonalTheme }) {
  const particles = useMemo(
    () => createParticles(THEME_PARTICLE_COUNT[theme], THEME_GLYPHS[theme]),
    [theme]
  )

  return (
    <div className={`snowfall snowfall--${theme}`} aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="snowfall__flake"
          style={{
            left: `${particle.left}%`,
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
            fontSize: `${particle.size}rem`,
            opacity: particle.opacity
          }}
        >
          {particle.glyph}
        </span>
      ))}
    </div>
  )
}
