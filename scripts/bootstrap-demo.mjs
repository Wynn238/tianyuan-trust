import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PLATFORM = path.join(ROOT, 'platform');
const DB = path.join(PLATFORM, 'data', 'tianyuan.sqlite');
const PORT = Number(process.env.PORT) || 8848;
const URL = `http://127.0.0.1:${PORT}`;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || '123456';

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: 'inherit', ...options });
}

function nodeVersionOk() {
  const [major] = process.versions.node.split('.').map(Number);
  return major >= 22;
}

async function healthy() {
  try {
    const response = await fetch(`${URL}/api/health`, { signal: AbortSignal.timeout(900) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    if (await healthy()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function openBrowser() {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', URL], { stdio: 'ignore', detached: true });
    return;
  }
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(command, [URL], { stdio: 'ignore', detached: true });
}

if (!nodeVersionOk()) {
  console.error('需要 Node.js 22 或更高版本。当前版本：' + process.versions.node);
  process.exit(1);
}

if (!existsSync(PLATFORM)) {
  console.error('找不到 platform 目录。请在仓库根目录执行本脚本。');
  process.exit(1);
}

if (await healthy()) {
  console.log(`检测到服务已在运行：${URL}`);
  if (!process.env.NO_OPEN) openBrowser();
  process.exit(0);
}

if (!existsSync(path.join(PLATFORM, 'node_modules', 'better-sqlite3'))) {
  console.log('首次运行：正在安装依赖（需要联网，可能需要几分钟）...');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = run(npm, ['install', '--no-audit', '--no-fund'], { cwd: PLATFORM, shell: process.platform === 'win32' });
  if (install.status !== 0) {
    console.error('依赖安装失败。请确认已安装 Node.js 22+ 和 npm，并检查网络。');
    process.exit(install.status || 1);
  }
}

mkdirSync(path.join(PLATFORM, 'data'), { recursive: true });
let freshDatabase = false;
if (!existsSync(DB)) {
  console.log('首次运行：正在生成演示数据...');
  const init = run(process.execPath, ['scripts/init-db.mjs'], { cwd: PLATFORM });
  if (init.status !== 0) process.exit(init.status || 1);
  freshDatabase = true;
}

if (freshDatabase) {
  console.log('首次运行：正在把演示账号口令设置为公开演示口令...');
  const reset = run(process.execPath, ['scripts/set-local-demo-passwords.mjs'], {
    cwd: PLATFORM,
    env: { ...process.env, DEMO_PASSWORD },
  });
  if (reset.status !== 0) {
    console.error('演示口令初始化失败。');
    process.exit(reset.status || 1);
  }
}

console.log(`正在启动田源可信：${URL}`);
console.log('仅限本地/课程演示；按 Ctrl+C 停止。');
const server = spawn(process.execPath, ['server.js'], {
  cwd: PLATFORM,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'inherit',
});

server.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => {
  server.kill('SIGINT');
  setTimeout(() => process.exit(0), 300);
});

if (await waitForServer()) {
  if (!process.env.NO_OPEN) openBrowser();
  else console.log(`服务已就绪：${URL}`);
} else {
  console.error(`服务没有在预期时间内就绪，请手动打开 ${URL}`);
}
