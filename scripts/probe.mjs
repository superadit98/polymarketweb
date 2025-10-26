#!/usr/bin/env node
const target = process.env.PROBE_URL ?? 'http://localhost:3000/api/debug';

async function main() {
  try {
    const res = await fetch(target);
    const text = await res.text();
    console.log(`[probe] status=${res.status}`);
    console.log(text);
  } catch (error) {
    console.error('[probe] request failed', error);
    process.exitCode = 1;
  }
}

main();
