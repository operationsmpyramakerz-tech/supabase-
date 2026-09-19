import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { getPerformanceSnapshot } from "../../../../lib/performance-profiler";
import {
  buildProductionVerification,
  loadProductionAccelerationStatus,
} from "../../../../lib/production-performance-verification";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

function safeNumber(value, fallback, min, max) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

async function performanceGate() {
  return await getLegacyAccountGate(["Backup", "Users Center"]);
}

export async function GET(request) {
  const gate = await performanceGate();
  if (!gate.ok) {
    return noStore(
      { error: gate.error || "Performance diagnostics access is not allowed." },
      { status: gate.status || 403 },
    );
  }

  const url = new URL(request.url);
  const minutes = safeNumber(url.searchParams.get("minutes"), 15, 0.5, 60);
  const minSamples = Math.round(safeNumber(url.searchParams.get("minSamples"), 5, 1, 100));
  const targetP95Ms = safeNumber(url.searchParams.get("targetP95Ms"), 1800, 250, 30_000);
  const warningP95Ms = Math.max(
    targetP95Ms,
    safeNumber(url.searchParams.get("warningP95Ms"), 3000, targetP95Ms, 60_000),
  );

  // Capture the profiler window BEFORE reading the diagnostic manifest so this
  // request does not grade its own database-status probe.
  const profile = getPerformanceSnapshot({
    windowMs: Math.round(minutes * 60_000),
    limit: 100,
  });
  const database = await loadProductionAccelerationStatus();
  const verification = buildProductionVerification(profile, database, {
    minSamples,
    targetP95Ms,
    warningP95Ms,
  });

  return noStore({
    ok: true,
    verification,
    links: {
      rawProfile: `/next/api/performance/profile?minutes=${minutes}&limit=100`,
      databaseAcceleration: "/next/api/performance/db-acceleration?live=1",
    },
  });
}
