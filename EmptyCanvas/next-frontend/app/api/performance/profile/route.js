import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { clearPerformanceSamples, getPerformanceSnapshot } from "../../../../lib/performance-profiler";

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

  return noStore({
    ok: true,
    profile: getPerformanceSnapshot({
      windowMs: windowMsFromRequest(request),
      limit: new URL(request.url).searchParams.get("limit") || 30,
    }),
  });
}

export async function DELETE() {
  const gate = await performanceGate();
  if (!gate.ok) {
    return noStore({ error: gate.error || "Performance diagnostics access is not allowed." }, { status: gate.status || 403 });
  }

  const removed = clearPerformanceSamples();
  return noStore({ ok: true, removed });
}
