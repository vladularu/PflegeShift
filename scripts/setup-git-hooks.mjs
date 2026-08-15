import { execFileSync } from "node:child_process";

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});

console.log("Git-Hooks aktiviert: direkte Pushes nach master werden lokal blockiert.");
