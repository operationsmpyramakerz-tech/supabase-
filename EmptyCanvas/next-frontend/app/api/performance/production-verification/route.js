import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { getPerformanceSnapshot } from "../../../../lib/performance-profiler";
import { loadPersistentPerformanceSnapshot } from "../../../../lib/persistent-performance-profiler";
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

function criticalLocalSampleCount(profile = {}) {
  const rows = Array.isArray(profile?.operations) ? profile.operations : [];
  return rows
    .filter((row) => ["route", "page-data"].includes(String(row?.category || "").toLowerCase()))
    .reduce((sum, row) => sum + (Number(row?.count) || 0), 0);
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
  const forceLocal = ["local", "process", "memory"].includes(
    String(url.searchParams.get("source") || "").toLowerCase(),
  );
  const targetP95Ms = safeNumber(url.searchParams.get("targetP95Ms"), 1800, 250, 30_000);
  const warningP95Ms = Math.max(
    targetP95Ms,
    safeNumber(url.searchParams.get("warningP95Ms"), 3000, targetP95Ms, 60_000),
  );

  // Capture the profiler window BEFORE reading the diagnostic manifest so this
  // request does not grade its own database-status probe.
  const windowMs = Math.round(minutes * 60_000);
  const localProfile = getPerformanceSnapshot({
    windowMs,
    limit: 100,
  });
  const [persistent, database] = await Promise.all([
    loadPersistentPerformanceSnapshot({ windowMs, limit: 100 }),
    loadProductionAccelerationStatus(),
  ]);
  const profile = forceLocal
    ? localProfile
    : (persistent.available ? persistent.snapshot : localProfile);
  const telemetry = {
    source: profile.source || "process-local",
    forcedLocal: forceLocal,
    persistentAvailable: persistent.available,
    persistentSamples: persistent.snapshot?.sampleCount || 0,
    persistentEmpty: persistent.available && (persistent.snapshot?.sampleCount || 0) === 0,
    persistentTruncated: persistent.truncated === true,
    persistentRowLimit: persistent.rowLimit || null,
    persistentOldestAt: persistent.oldestAt || null,
    persistentNewestAt: persistent.newestAt || null,
    persistentCoverageMs: persistent.coverageMs || 0,
    localSamples: localProfile.sampleCount || 0,
    localCriticalSamples: criticalLocalSampleCount(localProfile),
    fallbackToLocal: !forceLocal && !persistent.available,
    ...(persistent.available ? {} : { persistentReason: persistent.reason || "Persistent telemetry is unavailable." }),
  };
  const verification = buildProductionVerification(profile, database, {
    minSamples,
    targetP95Ms,
    warningP95Ms,
  }, telemetry);

  return noStore({
    ok: true,
    telemetry,
    verification,
    links: {
      rawProfile: `/next/api/performance/profile?minutes=${minutes}&limit=100`,
      databaseAcceleration: "/next/api/performance/db-acceleration?live=1",
    },
  });
}
