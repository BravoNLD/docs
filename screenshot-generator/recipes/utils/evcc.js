import fs from "fs";
import waitOn from "wait-on";
import axios from "axios";
import { exec, execSync } from "child_process";
import playwrightConfig from "../../playwright.config";
import { mergeYaml } from "./yaml";

const BASE_URL = playwrightConfig.use.baseURL;

const DB_PATH = "./evcc.db";
const BINARY = "./evcc";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function start(config, sqlDumps) {
  await _clean();
  if (sqlDumps) {
    await _restoreDatabase(sqlDumps);
  }
  await _start(config);
}

export async function stop() {
  await _stop();
  await _clean();
}

export async function restart(config) {
  await _stop();
  await _start(config);
}

export async function cleanRestart(config) {
  await _stop();
  await _clean();
  await _start(config);
}

async function _restoreDatabase(sqlDumps) {
  const dumps = Array.isArray(sqlDumps) ? sqlDumps : [sqlDumps];
  for (const dump of dumps) {
    console.log("loading database", dump);
    execSync(`sqlite3 ${DB_PATH} < recipes/${dump}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
  }
}

let instance = null;

async function _start(config) {
  const configPath =
    typeof config === "string"
      ? `recipes/${config}`
      : mergeYaml(`recipes/${config[0]}`, `recipes/${config[1]}`);

  console.log("starting evcc", { config });
  instance = exec(
    `EVCC_DATABASE_DSN=${DB_PATH} ${BINARY} --config ${configPath}`,
  );
  instance.stdout.pipe(process.stdout);
  instance.stderr.pipe(process.stderr);
  instance.on("exit", (code) => {
    if (code !== 0) {
      console.log("evcc terminated");
    }
  });
  await waitOn({ resources: [BASE_URL] });
}

async function _stop() {
  console.log("shutting down evcc");
  instance.kill("SIGKILL");
  await waitOn({ resources: [BASE_URL], reverse: true });
  await sleep(300);
}

async function _clean() {
  if (fs.existsSync(DB_PATH)) {
    console.log("delete database", DB_PATH);
    fs.unlinkSync(DB_PATH);
  }
}
