import { existsSync } from "fs"
import { resolve } from "path"
import process from "process"
import { preview } from "vite"

function resolvePort(value) {
  if (!value) {
    return 4173
  }

  const parsed = Number.parseInt(value, 10)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }

  console.warn(
    `Ignoring invalid PORT value "${value}". Falling back to default port 4173.`
  )
  return 4173
}

async function start() {
  const host = process.env.HOST ?? "0.0.0.0"
  const port = resolvePort(process.env.PORT)
  const distDir = resolve(process.cwd(), "dist")

  if (!existsSync(distDir)) {
    console.error(
      "Build output not found. Run `npm run build` before starting the preview server."
    )
    process.exit(1)
  }

  try {
    const server = await preview({
      root: process.cwd(),
      preview: {
        host,
        port,
      },
    })

    server.printUrls()

    const shutdown = async () => {
      await server.close()
      process.exit(0)
    }

    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
  } catch (error) {
    console.error("Failed to start Vite preview server", error)
    process.exit(1)
  }
}

start()
