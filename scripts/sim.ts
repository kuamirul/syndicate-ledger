// CLI: npm run sim [-- --games 1000 --seed 1]
import { formatReport, runSimulation } from './simCore';

function readFlag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} must be a positive integer`);
    process.exit(1);
  }
  return n;
}

const games = readFlag('games', 1000);
const seed = readFlag('seed', 1);

const start = performance.now();
const report = runSimulation(games, seed);
const elapsed = performance.now() - start;

console.log(formatReport(report, elapsed));
console.log(`ms/game-week: ${(elapsed / (report.avgWeeks * games)).toFixed(3)} (target <= 0.25)`);
const BUDGET_MS_PER_1000 = 7000; // M2-T0: 28-week games
if (games >= 1000 && elapsed > (BUDGET_MS_PER_1000 * games) / 1000) {
  console.warn(`\nWARNING: ${games} games took ${elapsed.toFixed(0)} ms (target < ${(BUDGET_MS_PER_1000 * games) / 1000} ms)`);
}
