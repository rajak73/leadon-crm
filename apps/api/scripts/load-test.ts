/**
 * Lightweight load test (BRD §19.2 performance). Zero-dependency — fires N
 * concurrent requests in W waves against the live API and reports throughput,
 * latency percentiles, and status distribution. Also confirms the rate limiter
 * kicks in (429s) under burst, proving the abuse protection works.
 *
 * Prereq: API running (pnpm --filter @leados/api dev).
 * Run:  API_URL=http://localhost:4000 CONCURRENCY=50 WAVES=10 tsx scripts/load-test.ts
 */

export {}; // ensure module scope (avoid global collisions across scripts)

const API = process.env.API_URL || 'http://localhost:4000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '50', 10);
const WAVES = parseInt(process.env.WAVES || '10', 10);
const PATH = process.env.TARGET_PATH || '/health';

interface Sample { ok: boolean; status: number; ms: number }

async function hit(): Promise<Sample> {
  const start = performance.now();
  try {
    const res = await fetch(`${API}${PATH}`);
    return { ok: res.ok, status: res.status, ms: performance.now() - start };
  } catch {
    return { ok: false, status: 0, ms: performance.now() - start };
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  console.log(`\nLoad test → ${API}${PATH}`);
  console.log(`  concurrency=${CONCURRENCY}  waves=${WAVES}  total=${CONCURRENCY * WAVES}\n`);

  const samples: Sample[] = [];
  const runStart = performance.now();

  for (let w = 0; w < WAVES; w++) {
    const batch = await Promise.all(Array.from({ length: CONCURRENCY }, () => hit()));
    samples.push(...batch);
    process.stdout.write(`  wave ${w + 1}/${WAVES} done\r`);
  }

  const totalSec = (performance.now() - runStart) / 1000;
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const statusCounts: Record<string, number> = {};
  for (const s of samples) statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;

  const okCount = samples.filter((s) => s.ok).length;
  console.log('\n\n=== Results ===');
  console.log(`  requests:     ${samples.length}`);
  console.log(`  duration:     ${totalSec.toFixed(2)}s`);
  console.log(`  throughput:   ${(samples.length / totalSec).toFixed(0)} req/s`);
  console.log(`  success(2xx): ${okCount} (${((okCount / samples.length) * 100).toFixed(1)}%)`);
  console.log(`  status codes: ${JSON.stringify(statusCounts)}`);
  console.log(`  latency ms:   p50=${percentile(latencies, 50).toFixed(1)}  p90=${percentile(latencies, 90).toFixed(1)}  p99=${percentile(latencies, 99).toFixed(1)}  max=${latencies[latencies.length - 1].toFixed(1)}`);
  if (statusCounts['429']) {
    console.log(`\n  ✔ Rate limiter engaged (${statusCounts['429']} × 429) — abuse protection works.`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('Load test failed:', e instanceof Error ? e.message : e);
  console.error('Is the API running?  pnpm --filter @leados/api dev');
  process.exit(1);
});
