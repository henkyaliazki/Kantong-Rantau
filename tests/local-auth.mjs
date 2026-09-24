import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const load = async (path) =>
  import(
    "data:text/javascript;base64," +
      Buffer.from(
        ts.transpileModule(readFileSync(path, "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
          },
        }).outputText,
      ).toString("base64")
  );
const { allowedRequestOrigin: check } = await load("lib/request-origin.ts");
const req = (origin) =>
  new Request("http://127.0.0.1:3000/api/finance", {
    method: "POST",
    headers: { origin },
  });
assert.equal(check(req("http://127.0.0.1:3000"), "production"), true);
assert.equal(check(req("http://localhost:3000"), "development"), true);
assert.equal(check(req("http://localhost:3000"), "production"), false);
for (const origin of [
  "http://localhost:3001",
  "https://localhost:3000",
  "https://evil.example",
  "null",
  "http://localhost.attacker.test:3000",
])
  assert.equal(check(req(origin), "development"), false);
const { localAuthEnabled } = await load("lib/local-auth.ts");
const saved = { ...process.env };
process.env.LOCAL_DEV_USER_ID = "test";
process.env.LOCAL_DEV_USER_EMAIL = "test@example.test";
process.env.NODE_ENV = "development";
assert.equal(localAuthEnabled(), true);
process.env.NODE_ENV = "production";
assert.equal(localAuthEnabled(), false);
process.env.NODE_ENV = "test";
delete process.env.LOCAL_DEV_USER_ID;
assert.equal(localAuthEnabled(), false);
for (const key of ["NODE_ENV", "LOCAL_DEV_USER_ID", "LOCAL_DEV_USER_EMAIL"]) {
  if (saved[key] === undefined) delete process.env[key];
  else process.env[key] = saved[key];
}
console.log("Local origin and development-auth checks passed.");
