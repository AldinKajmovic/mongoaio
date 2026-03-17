#!/usr/bin/env node

// MongoAIO launcher.
// Resolve Electron through the package itself so Windows/Linux/macOS all use
// the correct binary, then run in the foreground so Docker keeps the process alive.

const { spawn } = require('child_process');
const os = require('os');

let electronPath;
try {
  electronPath = require('electron');
} catch (_) {
  console.error('\n❌ ERROR: Electron not found!');
  console.error('Please run "npm install" first.\n');
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronArgs = [];
const isLinux = process.platform === 'linux';
const isDocker =
  env.DOCKER === '1' ||
  env.CONTAINER === '1' ||
  env.ELECTRON_DISABLE_SANDBOX === '1';

// Some Linux environments block Chromium's sandbox even for normal users.
if (isLinux) {
  env.ELECTRON_DISABLE_SANDBOX = '1';
  electronArgs.push('--no-sandbox');
  electronArgs.push('--disable-setuid-sandbox');
  electronArgs.push('--disable-gpu');
}

if (isDocker) {
  electronArgs.push('--disable-dev-shm-usage');
}

electronArgs.push(__dirname);

console.log(`Launching CompareDB on ${os.platform()}...`);

const child = spawn(electronPath, electronArgs, {
  env,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('\n❌ Failed to launch Electron.');
  console.error(error.message);
  process.exit(1);
});
