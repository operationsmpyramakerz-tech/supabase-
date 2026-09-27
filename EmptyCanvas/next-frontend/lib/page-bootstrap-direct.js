import "server-only";

import { getDirectAccountGate } from "./products-auth";
import { loadHomeOverviewDirect } from "./home-overview-data";
import { notificationsForMember } from "./notifications-data";
import { loadDirectKpisPageData } from "./kpis-data";
import { loadDirectTaskManagementPageData } from "./task-management-data";
import {
  loadDirectB2cDatabasePageData,
  loadDirectB2cFormsPageData,
  loadDirectB2cTablePageData,
} from "./b2c-data";

function text(value) {
  return String(value ?? "").trim();
}

function resource(url, body, ttlMs = 30_000) {
  return {
    url: String(url || "").trim(),
    status: 200,
    ttlMs: Math.max(1_000, Number(ttlMs) || 30_000),
    body,
  };
}

function result(status, data, error = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    data,
    location: "",
    ...(error ? { error } : {}),
  };
}

function failure(status, message) {
  const cleanStatus = Number(status) || 500;
  const error = text(message) || "Unable to prepare page data.";
  return result(cleanStatus, { ok: false, error }, error);
}

function normalizeDuration(value) {
  const clean = text(value).toLowerCase();
  return ["all", "week", "month", "year"].includes(clean) ? clean : "all";
}

function pageBundle(scope, resources, startedAt, omitted = []) {
  return {
    ok: true,
    scope,
    resources,
    partial: omitted.length > 0,
    omitted,
    generatedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    source: "next-direct",
  };
}

export async function fetchDirectPageBootstrap(pathname) {
  const startedAt = Date.now();
  const url = new URL(String(pathname || "/api/page-bootstrap"), "http://next.local");
  const scope = text(url.searchParams.get("scope")).toLowerCase();

  try {
    if (scope === "home") {
      const gate = await getDirectAccountGate([]);
      if (!gate.ok) return failure(gate.status || 503, gate.error || "Authentication required.");
      const requestedUserId = text(url.searchParams.get("analysisUser")) || "all";
      const duration = normalizeDuration(url.searchParams.get("analysisDuration"));
      const overview = await loadHomeOverviewDirect({ account: gate.account, requestedUserId, duration });
      return result(200, pageBundle(scope, [
        resource("/api/account", gate.account, 15_000),
        resource("/api/home/overview", overview, 10_000),
      ], startedAt));
    }

    if (scope === "notifications") {
      const gate = await getDirectAccountGate([]);
      if (!gate.ok) return failure(gate.status || 503, gate.error || "Authentication required.");
      const payload = await notificationsForMember(gate.memberId, { limit: 80 });
      return result(200, pageBundle(scope, [
        resource("/api/account", gate.account, 15_000),
        resource("/api/notifications", payload, 5_000),
      ], startedAt));
    }

    if (scope === "kpis") {
      const pageData = await loadDirectKpisPageData();
      if (!pageData?.ok) return failure(pageData?.status || 503, pageData?.error || "KPIs could not be loaded.");
      return result(200, pageBundle(scope, [
        resource("/api/account", pageData.account, 15_000),
        resource("/api/kpis/meta", pageData.meta, 15_000),
        resource("/api/kpis/reviews", pageData.reviews, 10_000),
        resource("/api/kpis/graph", pageData.graph, 10_000),
      ], startedAt, pageData.warnings || []));
    }

    if (scope === "task-management") {
      const view = text(url.searchParams.get("view")).toLowerCase();
      if (!["all", "my", "delegated"].includes(view)) return failure(400, "A valid Task Management view is required.");
      const pageData = await loadDirectTaskManagementPageData({ view });
      if (!pageData?.ok) return failure(pageData?.status || 503, pageData?.error || "Task Management could not be loaded.");
      return result(200, pageBundle(scope, [
        resource("/api/account", pageData.account, 15_000),
        resource(`/api/task-management/meta?view=${encodeURIComponent(view)}`, pageData.meta, 15_000),
        resource(`/api/task-management?view=${encodeURIComponent(view)}`, { ok: true, view, tickets: pageData.tickets || [] }, 10_000),
      ], startedAt, pageData.warnings || []));
    }

    if (scope === "b2c-database") {
      const pageData = await loadDirectB2cDatabasePageData();
      if (!pageData?.ok) return failure(pageData?.status || 503, pageData?.error || "B2C Database could not be loaded.");
      return result(200, pageBundle(scope, [
        resource("/api/account", pageData.account, 15_000),
        resource("/api/b2c/databases", pageData.payload, 15_000),
      ], startedAt, pageData.warnings || []));
    }

    if (scope === "b2c-forms") {
      const formId = text(url.searchParams.get("form"));
      const pageData = await loadDirectB2cFormsPageData({ formId });
      if (!pageData?.ok) return failure(pageData?.status || 503, pageData?.error || "B2C Forms could not be loaded.");
      const resources = [
        resource("/api/account", pageData.account, 15_000),
        resource("/api/b2c/forms", pageData.payload, 15_000),
      ];
      if (formId && pageData.selected) {
        resources.push(resource(`/api/b2c/forms/${encodeURIComponent(formId)}`, pageData.selected, 10_000));
      }
      return result(200, pageBundle(scope, resources, startedAt, pageData.warnings || []));
    }

    if (scope === "b2c-table") {
      const databaseId = text(url.searchParams.get("id"));
      if (!databaseId) return failure(400, "A B2C database id is required.");
      const pageData = await loadDirectB2cTablePageData(databaseId);
      if (!pageData?.ok) return failure(pageData?.status || 503, pageData?.error || "B2C table could not be loaded.");
      return result(200, pageBundle(scope, [
        resource("/api/account", pageData.account, 15_000),
        resource(`/api/b2c/databases/${encodeURIComponent(databaseId)}/records`, pageData.payload, 10_000),
      ], startedAt, pageData.warnings || []));
    }

    return failure(400, "Unknown page bootstrap scope.");
  } catch (error) {
    return failure(error?.status || 500, error?.message || "Unable to prepare page data.");
  }
}
