// Prepares the Dashboard real-API Chromium suite: a disposable database built by the real Operations API
// (checked out at ./operations-api) with the protected root identity bootstrapped through its CLI service.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const fixturePath = path.join(root, "e2e", ".real-api-fixture.json");

if (!process.env.ARASYA_E2E_DB_NAME) {
  console.error("ARASYA_E2E_DB_NAME is required (a dedicated database whose name contains 'e2e' and 'test').");
  process.exit(2);
}
if (!existsSync(path.join(root, "operations-api", "public", "index.php"))) {
  const ref = readFileSync(path.join(root, "e2e", "operations-api.ref"), "utf8").trim();
  console.error(`./operations-api is missing. Check out dmrysf/staff_arasyahome@${ref} and link its operations-api directory here.`);
  process.exit(2);
}

const output = execFileSync("php", [path.join(root, "e2e", "dashboard-fixture.php")], { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
writeFileSync(fixturePath, JSON.stringify(JSON.parse(output), null, 2), { mode: 0o600 });
mkdirSync(path.join(root, "e2e", ".runtime", "home"), { recursive: true });
console.log("Dashboard real-API E2E fixture ready.");
