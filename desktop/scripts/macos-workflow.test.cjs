// Configuration regressions only; these do not simulate a native macOS build.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const yaml = require("js-yaml");

const root = path.resolve(__dirname, "../..");
const workflow = yaml.load(
  readFileSync(path.join(root, ".github/workflows/desktop-macos.yml"), "utf8"),
);
const steps = workflow.jobs.macos.steps;
const build = steps.find(
  (step) => step.name === "Build Apple Silicon application and DMG",
);
const verify = steps.find(
  (step) =>
    step.name === "Verify native architecture and application signature",
);
const upload = steps.find((step) =>
  step.uses?.startsWith("actions/upload-artifact@"),
);

test("retains the app for validation instead of requesting a DMG-only build", () => {
  const bundles = build.run.match(/--bundles\s+(\S+)/)[1].split(",");
  assert.deepEqual(new Set(bundles), new Set(["app", "dmg"]));
  assert.match(build.run, /--target aarch64-apple-darwin/);
  assert.match(build.run, /--features custom-protocol/);
  assert.match(build.run, /--ci -- --locked$/);
});

test("discovers the retained app and reads its declared executable", () => {
  assert.match(verify.run, /bundle\/macos\/\*\.app/);
  assert.match(verify.run, /\$\{#apps\[@\]\}.*-ne 1/);
  assert.match(verify.run, /PlistBuddy -c 'Print :CFBundleExecutable'/);
  assert.match(verify.run, /binary="\$app\/Contents\/MacOS\/\$executable"/);
  assert.match(verify.run, /! -f "\$binary"/);
  assert.match(verify.run, /! -x "\$binary"/);
});

test("keeps lipo argument order and mandatory signature checks before upload", () => {
  assert.match(verify.run, /^\/usr\/bin\/lipo "\$binary" -verify_arch arm64$/m);
  assert.match(
    verify.run,
    /^\/usr\/bin\/codesign --verify --deep --strict --verbose=2 "\$app"$/m,
  );
  assert.match(verify.run, /set -euo pipefail/);
  assert.notEqual(verify["continue-on-error"], true);
  assert.equal(upload.if, undefined);
  assert(steps.indexOf(build) < steps.indexOf(verify));
  assert(steps.indexOf(verify) < steps.indexOf(upload));
});

test("uploads the DMG package, not a raw app or Windows executable", () => {
  const stage = steps.find(
    (step) => step.name === "Stage installer and licenses",
  );
  assert.match(stage.run, /bundle\/dmg\/\*\.dmg/);
  assert.match(upload.with.name, /^Excalidraw-Personal-macOS-arm64-/);
  assert.equal(
    upload.with.path,
    "desktop/artifacts/Excalidraw-Personal-macOS-arm64/",
  );
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.deepEqual(workflow.permissions, { contents: "read" });
});
