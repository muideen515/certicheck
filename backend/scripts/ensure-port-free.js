#!/usr/bin/env node

const { execSync } = require('child_process');

function shell(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (error) {
    return '';
  }
}

function parsePids(value) {
  return [...new Set(
    value
      .split(/\s+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => /^\d+$/.test(part))
  )];
}

function stopPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch (error) {
      // ignore already-dead processes
    }
  }
}

function forceStopPids(pids) {
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch (error) {
      // ignore already-dead processes
    }
  }
}

const port = 5000;
const lsofOutput = shell(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}'`);
const usedPids = parsePids(lsofOutput);

if (!usedPids.length) {
  console.log(`Port ${port} is free. Starting backend...`);
  return;
}

console.log(`Port ${port} is occupied by PID(s): ${usedPids.join(', ')}. Stopping stale Certicheck server process...`);
stopPids(usedPids);

setTimeout(() => {
  const remaining = parsePids(shell(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}'`));

  if (remaining.length) {
    console.log(`Port ${port} still occupied after graceful stop. Force-stopping PID(s): ${remaining.join(', ')}`);
    forceStopPids(remaining);
  }

  const checkAgain = parsePids(shell(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2}'`));

  if (checkAgain.length) {
    console.error(`Could not free port ${port}. Remaining PID(s): ${checkAgain.join(', ')}`);
    process.exit(1);
  }

  console.log(`Port ${port} is free again.`);
}, 1000);
