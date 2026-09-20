import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { clearPerformanceSamples, getPerformanceSnapshot } from "../../../../lib/performance-profiler";
import { clearPersistentPerformanceSamples, loadPersistentPerformanceSnapshot } from "../../../../lib/persistent-performance-profiler";

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

function windowMsFromRequest(request) {
  const url = new URL(request.url);
  const minutes = Number(url.searchParams.get("minutes") || 10);
  const safeMinutes = Math.max(0.5, Math.min(60, Number.isFinite(minutes) ? minutes : 10));
  return Math.round(safeMinutes * 60_000);
}

async function performanceGate() {
  return await getLegacyAccountGate(["Backup", "Users Center"]);
}

export async function GET(request) {
  const gate = await performanceGate();
  if (!gate.ok) {
    return noStore({ error: gate.error || "Performance diagnostics access is not allowed." }, { status: gate.status || 403 });
  }

  const url = new URL(request.url);
  const windowMs = windowMsFromRequest(request);
  const limit = url.searchParams.get("limit") || 30;
  const localOnly = ["local", "process", "memory"].includes(String(url.searchParams.get("source") || "").toLowerCase());
  const localProfile = getPerformanceSnapshot({ windowMs, limit });

  if (localOnly) {
    return noStore({ ok: true, source: "process-local", profile: localProfile });
  }

  const persistent = await loadPersistentPerformanceSnapshot({ windowMs, limit });
  // If the persistent store is installed, an empty window is meaningful. Do
  // not silently replace it with one warm instance and call that production
  // telemetry; callers can explicitly request ?source=local when needed.
  const profile = persistent.available
    ? persistent.snapshot
    : localProfile;

  return noStore({
    ok: true,
    source: profile.source || "process-local",
    persistentAvailable: persistent.available,
    persistentEmpty: persistent.available && (persistent.snapshot?.sampleCount || 0) === 0,
    persistentTruncated: persistent.truncated === true,
    persistentRowLimit: persistent.rowLimit || null,
    persistentOldestAt: persistent.oldestAt || null,
    persistentNewestAt: persistent.newestAt || null,
    persistentCoverageMs: persistent.coverageMs || 0,
    fallbackToLocal: !persistent.available,
    ...(persistent.available ? {} : { persistentReason: persistent.reason || "Persistent telemetry is unavailable." }),
    profile,
  });
}

export async function DELETE() {
  const gate = await performanceGate();
  if (!gate.ok) {
    return noStore({ error: gate.error || "Performance diagnostics access is not allowed." }, { status: gate.status || 403 });
  }

  const localRemoved = clearPerformanceSamples();
  const persistent = await clearPersistentPerformanceSamples();
  return noStore({
    ok: true,
    localRemoved,
    persistent,
  });
}
