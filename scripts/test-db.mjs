import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFiles() {
  const values = {};
  for (const name of [".env", ".env.test"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      } else {
        value = value.replace(/\s+#.*$/, "");
      }
      values[match[1]] = value;
    }
  }
  return values;
}

const fileEnv = readEnvFiles();
const env = { ...fileEnv, ...process.env };
const testUrl = env.TEST_DATABASE_URL;
const confirmation = "I_UNDERSTAND_TEST_DATABASE_WILL_BE_RESET";

if (!testUrl) {
  console.error("Set TEST_DATABASE_URL in .env.test to a dedicated, disposable Supabase/PostgreSQL test database.");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(testUrl)) {
  console.error("TEST_DATABASE_URL must use PostgreSQL.");
  process.exit(1);
}
if (env.TEST_DATABASE_RESET_CONFIRM !== confirmation) {
  console.error(`Set TEST_DATABASE_RESET_CONFIRM=${confirmation} only after confirming the test database contains no needed data.`);
  process.exit(1);
}

const directUrl = env.TEST_DATABASE_DIRECT_URL || testUrl;
if (!/^postgres(ql)?:\/\//i.test(directUrl)) {
  console.error("TEST_DATABASE_DIRECT_URL must use PostgreSQL.");
  process.exit(1);
}
if (testUrl === env.DATABASE_URL || directUrl === env.DIRECT_URL) {
  console.error("The test database URL must not exactly match the app's configured database URL.");
  process.exit(1);
}

function targetIdentity(value) {
  const url = new URL(value);
  const username = decodeURIComponent(url.username);
  const projectRef = url.hostname.startsWith("db.")
    ? url.hostname.split(".")[1]
    : username.match(/^postgres\.([^.]+)$/)?.[1];
  if (projectRef) return { provider: "supabase", identity: projectRef };
  return {
    provider: "postgresql",
    identity: `${url.hostname}:${url.port || "5432"}:${url.pathname}:${url.searchParams.get("schema") || "public"}`,
  };
}

const testIdentity = targetIdentity(testUrl);
const directIdentity = targetIdentity(directUrl);
const sameTarget = (left, right) => left.provider === right.provider && left.identity === right.identity;
if (testIdentity.provider === "supabase" && directIdentity.provider === "supabase" && !sameTarget(testIdentity, directIdentity)) {
  console.error("TEST_DATABASE_DIRECT_URL must point to the same dedicated Supabase project as TEST_DATABASE_URL.");
  process.exit(1);
}

for (const applicationUrl of [env.DATABASE_URL, env.DIRECT_URL]) {
  if (!applicationUrl) continue;
  const applicationIdentity = targetIdentity(applicationUrl);
  if (sameTarget(applicationIdentity, testIdentity) || sameTarget(applicationIdentity, directIdentity)) {
    console.error("Use a separate Supabase project for tests; the app's configured project cannot be reset by the test runner.");
    process.exit(1);
  }
}

const childEnv = {
  ...env,
  DATABASE_URL: testUrl,
  DIRECT_URL: directUrl,
  AUTH_SECRET: "test-only-secret-that-is-at-least-thirty-two-bytes",
};
const command = process.argv[2];
const args = command === "prepare"
  ? [resolve(root, "node_modules/prisma/build/index.js"), "db", "push", "--schema=prisma/schema.prisma", "--accept-data-loss"]
  : command === "run"
    ? [resolve(root, "node_modules/vitest/vitest.mjs"), "run", ...process.argv.slice(3)]
    : null;

if (!args) {
  console.error("Usage: node scripts/test-db.mjs <prepare|run>");
  process.exit(2);
}

const result = spawnSync(process.execPath, args, { cwd: root, env: childEnv, stdio: "inherit" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
