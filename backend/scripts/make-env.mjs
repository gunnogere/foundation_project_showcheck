// Builds backend/.env from backend/config.env so nobody has to write the database URL by hand.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("..", import.meta.url));
const configPath = `${dir}config.env`;
const envPath = `${dir}.env`;

if (!existsSync(configPath)) {
  console.error("backend/config.env not found. Get it from the team and put it in backend/ (see config.env.example).");
  process.exit(1);
}

const parse = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );

const c = parse(readFileSync(configPath, "utf8"));
for (const key of ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"])
  if (!c[key]) {
    console.error(`${key} is missing in backend/config.env`);
    process.exit(1);
  }

const ssl = c.DB_SSL === "true" ? "?sslaccept=accept_invalid_certs" : "";
const url = `mysql://${encodeURIComponent(c.DB_USER)}:${encodeURIComponent(c.DB_PASSWORD)}@${c.DB_HOST}:${c.DB_PORT}/${c.DB_NAME}${ssl}`;

// Keep the same login secret between runs so people stay signed in.
const oldSecret = existsSync(envPath) ? parse(readFileSync(envPath, "utf8")).JWT_SECRET?.replace(/"/g, "") : null;
const secret = oldSecret || randomBytes(32).toString("hex");

writeFileSync(envPath, `DATABASE_URL="${url}"\nJWT_SECRET="${secret}"\n`, { mode: 0o600 });
console.log("Created backend/.env from config.env");
