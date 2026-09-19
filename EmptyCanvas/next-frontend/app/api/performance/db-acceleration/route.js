import { NextResponse } from "next/server";
import { getLegacyAccountGate } from "../../../../lib/products-auth";
import { rpc } from "../../../../lib/supabase-rest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RPC_PROBES = [
  { name: "erp_order_candidate_numbers", args: { p_options: { context: "__probe__", limit: 1 } } },
  { name: "erp_home_order_groups", args: { p_options: { includeCurrent: false, includeReview: false, includeApproved: false } } },
  { name: "erp_home_stock_summary", args: { p_options: {} } },
  { name: "erp_home_expenses_summary", args: { p_options: {} } },
  { name: "erp_stocktaking_folder_summaries", args: {} },
  { name: "erp_product_proposal_headers", args: {} },
  { name: "erp_product_kit_headers", args: {} },
  { name: "erp_expense_order_options", args: {} },
  { name: "erp_expense_type_options", args: {} },
  { name: "erp_expense_users_summary", args: {} },
];

function noStore(payload, init = {}) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init.headers || {}),
    },
  });
}

function shortMessage(error) {
  return String(error?.message || error?.details?.message || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function missingRpc(error, name) {
  const status = Number(error?.status) || 0;
  const message = [
    error?.message,
    error?.details?.message,
    error?.details?.details,
    error?.details?.hint,
    error?.details?.code,
  ].filter(Boolean).join(" ").toLowerCase();
  const wanted = String(name || "").toLowerCase();
  if (status === 404 && (!wanted || message.includes(wanted))) return true;
  return message.includes(wanted)
    && /could not find|schema cache|pgrst202|does not exist|undefined function|42883/.test(message);
}

async function performanceGate() {
  return await getLegacyAccountGate(["Backup", "Users Center"]);
}

async function loadInstalledManifest() {
  try {
    const rows = await rpc("erp_performance_acceleration_status", {}, {
      profileName: "db-acceleration.status",
      timeoutMs: 4_000,
    });
    return {
      installed: true,
      rows: (Array.isArray(rows) ? rows : []).map((row) => ({
        kind: String(row?.kind || "").trim(),
        name: String(row?.name || "").trim(),
        installed: row?.installed === true,
      })).filter((row) => row.kind && row.name),
    };
  } catch (error) {
    if (missingRpc(error, "erp_performance_acceleration_status")) {
      return { installed: false, rows: [] };
    }
    return {
      installed: false,
      rows: [],
      warning: shortMessage(error) || "Acceleration status RPC could not be read.",
    };
  }
}

async function probeRpc({ name, args }) {
  try {
    await rpc(name, args, {
      profileName: `db-acceleration.probe.${name}`,
      timeoutMs: 3_500,
    });
    return { kind: "rpc", name, state: "available" };
  } catch (error) {
    if (missingRpc(error, name)) return { kind: "rpc", name, state: "missing" };
    // A validation/data error still proves that PostgREST resolved the function.
    // We deliberately do not expose query values or detailed database payloads.
    return {
      kind: "rpc",
      name,
      state: "available-with-probe-error",
      status: Number(error?.status) || 0,
      message: shortMessage(error),
    };
  }
}

export async function GET() {
  const gate = await performanceGate();
  if (!gate.ok) {
    return noStore({ error: gate.error || "Performance diagnostics access is not allowed." }, { status: gate.status || 403 });
  }

  const manifest = await loadInstalledManifest();
  if (manifest.installed) {
    const installedCount = manifest.rows.filter((row) => row.installed).length;
    return noStore({
      ok: true,
      source: "database-manifest",
      summary: {
        total: manifest.rows.length,
        installed: installedCount,
        missing: Math.max(0, manifest.rows.length - installedCount),
      },
      accelerators: manifest.rows,
    });
  }

  const probes = await Promise.all(RPC_PROBES.map(probeRpc));
  const available = probes.filter((row) => row.state !== "missing").length;
  return noStore({
    ok: true,
    source: "rpc-probes",
    sqlPackInstalled: false,
    warning: manifest.warning || "Run supabase_performance_acceleration.sql to install the index pack and database manifest.",
    summary: {
      total: probes.length,
      installed: available,
      missing: probes.length - available,
    },
    accelerators: probes,
  });
}
