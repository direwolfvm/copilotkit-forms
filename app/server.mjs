import express from "express";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "dist");
const port = parseInt(process.env.PORT ?? "8080", 10);

if (!existsSync(join(distDir, "index.html"))) {
  console.error(
    "Build output not found. Make sure `npm run build` has been executed before starting the server."
  );
  process.exit(1);
}

app.use(express.static(distDir));

app.get("*", (_req, res) => {
  res.sendFile(join(distDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
