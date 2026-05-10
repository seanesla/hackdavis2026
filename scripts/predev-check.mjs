import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const REQUIRED_MAJOR = 22;
const FREE_RAM_WARN_GB = 4;
const FREE_RAM_DANGER_GB = 2;

const nodeMajor = Number(process.versions.node.split(".")[0]);
const freeRamGb = os.freemem() / 1024 / 1024 / 1024;
const totalRamGb = os.totalmem() / 1024 / 1024 / 1024;
const staleNext = fs.existsSync(path.join(process.cwd(), ".next"));

const nodeOk = nodeMajor === REQUIRED_MAJOR;
const nodeLine = nodeOk
  ? `v${process.versions.node} OK`
  : `v${process.versions.node} (expected v${REQUIRED_MAJOR}.x — see .nvmrc)`;

console.log("");
console.log("dev preflight ----------");
console.log(`  node:     ${nodeLine}`);
console.log(`  free ram: ${freeRamGb.toFixed(1)} GB / ${totalRamGb.toFixed(1)} GB`);
console.log(`  .next:    ${staleNext ? "exists (will reuse cache)" : "clean"}`);
console.log("------------------------");

if (!nodeOk) {
  console.log("");
  console.log(`WARNING: your Node version may not work. Install Node ${REQUIRED_MAJOR}:`);
  console.log(`  nvm install ${REQUIRED_MAJOR} && nvm use`);
}

if (freeRamGb < FREE_RAM_DANGER_GB) {
  console.log("");
  console.log(`STOP: only ${freeRamGb.toFixed(1)} GB free RAM.`);
  console.log("Close Chrome / Slack / Discord before starting dev,");
  console.log("or this may freeze your computer.");
  console.log("Press Ctrl+C now if you don't want to continue.");
} else if (freeRamGb < FREE_RAM_WARN_GB) {
  console.log("");
  console.log(`Heads up: only ${freeRamGb.toFixed(1)} GB free RAM.`);
  console.log("Closing Chrome / Slack helps avoid a freeze on first compile.");
}

console.log("");
