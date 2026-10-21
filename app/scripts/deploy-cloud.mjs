// Deploy HelpPermitMe (copilotkit-forms) to cloud.gov without printing or uploading local credentials.
//
//   cf login -a api.fr.cloud.gov --sso && cf target -o <org> -s <space>
//   node scripts/deploy-cloud.mjs                          # dry run: shows what would happen
//   node scripts/deploy-cloud.mjs --apply                  # build, push, configure, start, health check
//   node scripts/deploy-cloud.mjs --apply --env-file .env.hosted
//
// Runtime values come from the env file (default .env.cloudgov) and are sent to cloud.gov through
// the v3 API, so they never appear on the command line, in the terminal, or in manifest.yml.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = "copilotkit-forms";
const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const envFileIndex = args.indexOf("--env-file");
const envFile = join(appDir, envFileIndex >= 0 ? args[envFileIndex + 1] ?? "" : ".env.cloudgov");
const origin = process.env.DEPLOY_APP_ORIGIN ?? `https://${app}.app.cloud.gov`;

// Only the settings server.mjs and server/*.js read are sent to cloud.gov.
const allowed = /^(VITE_|NEXT_PUBLIC_)?(SUPABASE_|PERMITFLOW_|REVIEWWORKS_|COPILOTKIT_|SECTION106_|IPAC_|NEPA_MCP_)/;
// This app talks to Supabase with anon keys behind RLS; a service-role key must never reach it.
const forbidden = /SERVICE_ROLE|SECRET_KEY/;

if (!existsSync(envFile)) throw new Error(`Env file not found: ${envFile}`);
process.loadEnvFile(envFile);
const names = Object.keys(process.env).filter((name) => allowed.test(name)).sort();
const refused = names.filter((name) => forbidden.test(name));
if (refused.length) throw new Error(`Refusing to deploy server-only secrets: ${refused.join(", ")}`);
if (!names.some((name) => /SUPABASE_URL$/.test(name)))
  throw new Error(`${envFile} has no Supabase URL; load the hosted environment first`);

const variables = { NODE_ENV: "production", NPM_CONFIG_PRODUCTION: "true" };
for (const name of names) variables[name] = process.env[name];

if (!apply) {
  console.log(`Dry run: build ${app}, cf push --no-start, set ${names.length} variables, start, check ${origin}/api/health.`);
  console.log(`Variables (names only): ${names.join(", ")}`);
  console.log("Add --apply to deploy to the current cf target.");
  process.exit(0);
}

execFileSync("cf", ["target"], { stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: appDir, stdio: "inherit" });
execFileSync("cf", ["push", app, "-f", join(appDir, "..", "manifest.yml"), "--no-start"], { stdio: "inherit" });
const guid = execFileSync("cf", ["app", app, "--guid"], { encoding: "utf8" }).trim();
const result = JSON.parse(
  execFileSync(
    "cf",
    ["curl", `/v3/apps/${guid}/environment_variables`, "-X", "PATCH", "-d", JSON.stringify({ var: variables })],
    { encoding: "utf8" },
  ),
);
if (result.errors) throw new Error("cloud.gov environment configuration failed");
console.log(`Configured ${names.length} runtime variables for ${app} without logging values.`);
execFileSync("cf", ["start", app], { stdio: "inherit" });

const response = await fetch(`${origin}/api/health`);
if (!response.ok) throw new Error(`Health check failed: ${origin}/api/health returned ${response.status}`);
console.log(`Healthy: ${origin}/api/health`);
