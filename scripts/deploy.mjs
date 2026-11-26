// Собирает складрон здесь и выкладывает на домашний сервер.
//
// Сервер получает готовую standalone-сборку Next (server.js + только нужные
// пакеты, без npm install): `releases/<время>-<коммит>/`. Ссылка `current`
// переключается одним `mv -T` (атомарное переименование), затем процесс
// игры завершается, а systemd (Restart=always) поднимает его из нового релиза —
// sudo для этого не нужен, процесс наш.
//
// Собираем здесь, а не на сервере: процессор там слабый, исходников нет.
// Настройки — в `.env.deploy` (не в git):
//   DEPLOY_HOST                user@host
//   DEPLOY_DIR                 /srv/skladron (по умолчанию)
//   DEPLOY_BASE_PATH           /skladron (по умолчанию)
//   DEPLOY_PORT                3120 (по умолчанию; должен совпадать с юнитом)
//   NEXT_PUBLIC_SITE_URL       адрес игры снаружи — для ссылок в телеграме
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_TELEGRAM_BOT —
//                              публичные, вшиваются в сборку.
// Серверные секреты (service role, токен бота, CRON_SECRET…) живут только на
// сервере, в shared/.env. Разовая подготовка сервера: deploy/server-setup.sh.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const host = process.env.DEPLOY_HOST;
const dir = process.env.DEPLOY_DIR || "/srv/skladron";
const base = `/${(process.env.DEPLOY_BASE_PATH ?? "/skladron").replace(/^\/+|\/+$/g, "")}`;
const port = Number(process.env.DEPLOY_PORT ?? 3120);
// Сколько прежних релизов держать для ручного отката (`ln -sfn releases/<…> current`).
const KEEP = 3;

const step = (message) => console.log(`[deploy] ${message}`);

function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, {
    cwd: repo,
    stdio: "inherit",
    shell: process.platform === "win32" && (command === "npm" || command === "npx"),
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${argv[0] ?? ""} failed (${result.status ?? result.signal})`);
  return result.stdout;
}

const read = (command, argv) => run(command, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";

/** tar локальной папки → ssh: потоком, без временного архива на диске. */
function upload(from, remote) {
  return new Promise((resolve, reject) => {
    // Папка — через cwd, а не `-C`: tar из Git for Windows читает `C:\…` как `host:path`.
    const tar = spawn("tar", ["-cf", "-", "."], { cwd: from, stdio: ["ignore", "pipe", "inherit"] });
    const ssh = spawn("ssh", ["-o", "BatchMode=yes", host, `bash -c ${quote(remote)}`], { stdio: ["pipe", "inherit", "inherit"] });
    tar.stdout.pipe(ssh.stdin);
    let left = 2;
    const done = (name) => (code) => {
      if (code !== 0) reject(new Error(`${name} failed (${code})`));
      else if (--left === 0) resolve();
    };
    tar.on("error", reject).on("close", done("tar"));
    ssh.on("error", reject).on("close", done("ssh"));
  });
}

async function deploy() {
  if (!host || host.startsWith("-")) throw new Error("set DEPLOY_HOST=user@host in .env.deploy");
  if (!dir.startsWith("/") || dir.split("/").some((part) => part === "." || part === "..")) {
    throw new Error("DEPLOY_DIR must be an absolute path on the server");
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are missing in .env.deploy");
  }
  if (read("git", ["status", "--porcelain"]) && !args.has("--dirty")) {
    throw new Error("uncommitted changes: commit them (or pass --dirty to deploy the working tree as is)");
  }
  const commit = read("git", ["rev-parse", "--short", "HEAD"]);
  if (!args.has("--no-push")) run("git", ["push"]);

  // Отдельная папка сборки: не трогаем .next от npm run dev.
  const distDir = ".next-deploy";
  const built = path.join(repo, distDir);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "skladron-deploy-"));
  try {
    step(`building ${commit} for ${base}`);
    fs.rmSync(built, { recursive: true, force: true });
    // BASE_PATH через окружение, а не аргументом: Git Bash переписал бы `/skladron` в путь Windows.
    run("npx", ["next", "build"], {
      env: { ...process.env, BASE_PATH: base, NEXT_STANDALONE: "1", NEXT_DIST_DIR: distDir, NODE_ENV: "production" },
    });
    const standalone = path.join(built, "standalone");
    if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("build produced no standalone/server.js");

    // standalone не кладёт к себе статику и public — их раздаёт тот же server.js.
    fs.cpSync(standalone, out, { recursive: true });
    fs.cpSync(path.join(built, "static"), path.join(out, distDir, "static"), { recursive: true });
    fs.cpSync(path.join(repo, "public"), path.join(out, "public"), { recursive: true });
    // Никаких локальных .env в релиз: секреты сервера — в shared/.env.
    for (const name of fs.readdirSync(out)) if (name.startsWith(".env")) fs.rmSync(path.join(out, name));
    fs.writeFileSync(path.join(out, "COMMIT"), `${commit}\n`);

    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    const release = `${stamp}-${commit}`;
    const remote = [
      "set -eu",
      `root=${quote(dir)}`,
      'test -w "$root" || { echo "[deploy] $root is missing or not writable: run deploy/server-setup.sh once" >&2; exit 1; }',
      'test -f "$root/shared/.env" || { echo "[deploy] $root/shared/.env is missing (server secrets)" >&2; exit 1; }',
      `rel="$root/releases/${release}"`,
      'mkdir -p "$rel"',
      'tar -xf - -C "$rel"',
      // Новая ссылка рядом со старой, затем переименование поверх: атомарная замена.
      `ln -sfn "releases/${release}" "$root/.current.new"`,
      'mv -T "$root/.current.new" "$root/current"',
      // Перезапуск на новом коде: завершаем процесс, systemd поднимает его снова.
      "pid=$(systemctl show -p MainPID --value skladron.service 2>/dev/null || echo 0)",
      '[ "${pid:-0}" != 0 ] && kill "$pid" || echo "[deploy] skladron had no running process; systemd is retrying it"',
      `ls -1d "$root"/releases/*/ | head -n -${KEEP + 1} | xargs -r rm -rf --`,
      // Ждём, пока игра ответит на новой сборке, и проверяем её через Caddy.
      'ok=""',
      `for i in $(seq 1 60); do sleep 1; if curl -sf -o /dev/null http://127.0.0.1:${port}${base}; then ok=1; break; fi; done`,
      '[ -n "$ok" ] || { echo "[deploy] the game did not come back: journalctl -u skladron -n 50" >&2; exit 1; }',
      `code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1${base}")`,
      `[ "$code" = 200 ] || { echo "[deploy] caddy answered $code at ${base}" >&2; exit 1; }`,
    ].join("\n");
    step(`uploading to ${host}:${dir}/releases/${release}`);
    await upload(out, remote);
    step(`${commit} is live at ${base}`);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
}

try {
  await deploy();
} catch (error) {
  console.error(`[deploy] ${error.message}`);
  process.exitCode = 1;
}
