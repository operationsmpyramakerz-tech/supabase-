"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collectOrderTypeCounts } from "../../lib/order-filter-type-counts.mjs";

// Deliberately use the already permission-scoped paged-summary API: it applies
// exactly the same visibility, status-tab and search rules as the cards.
// Never infer total counts from the subset behind Load more.
export default function useCompleteOrderTypeCounts({ endpoint, tab, query }) {
  const [state, setState] = useState({ key: "", counts: null, loading: false, error: "" });
  const inFlight = useRef(null);
  const key = `${endpoint}|${tab}|${query.trim()}`;
  useEffect(() => () => { inFlight.current?.abort(); }, []);
  const refresh = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ key, counts: null, loading: true, error: "" });
    void collectOrderTypeCounts(async (cursor, signal) => {
      const params = new URLSearchParams({ mode: "summary", paged: "1", tab, filterType: "all", limit: "80" });
      if (query.trim()) params.set("q", query.trim());
      if (cursor !== null) params.set("cursor", String(cursor));
      const response = await fetch(`${endpoint}?${params}`, { credentials: "include", cache: "no-store", signal });
      if (!response.ok) throw new Error(`Could not count all orders (${response.status}).`);
      return await response.json();
    }, { signal: controller.signal }).then((counts) => {
      if (inFlight.current === controller && !controller.signal.aborted) setState({ key, counts, loading: false, error: "" });
    }).catch((error) => {
      if (inFlight.current === controller && !controller.signal.aborted) setState({ key, counts: null, loading: false, error: error?.message || "Could not count all orders." });
    });
  }, [endpoint, tab, query, key]);
  return {
    counts: state.key === key ? state.counts : null,
    loading: state.key === key && state.loading,
    error: state.key === key ? state.error : "",
    refresh,
  };
}
