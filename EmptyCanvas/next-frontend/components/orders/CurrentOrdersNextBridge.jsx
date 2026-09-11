"use client";

import { useEffect } from "react";
import CurrentOrdersClient from "./CurrentOrdersClient";

const CURRENT_ORDERS_READ = /^\/api\/orders(?:\?|$)/;
const CURRENT_ORDERS_ACTION = /^\/api\/orders\/current\/(archive|unarchive|delete)(?:\?|$)/;

export default function CurrentOrdersNextBridge(props) {
  useEffect(() => {
    const previousFetch = window.fetch;

    function patchedFetch(input, init) {
      const method = String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
      if (method === "GET" && typeof input === "string" && CURRENT_ORDERS_READ.test(input)) {
        const nextInput = input.replace(/^\/api\/orders/, "/next/api/orders");
        return previousFetch.call(window, nextInput, init);
      }
      if (method === "POST" && typeof input === "string" && CURRENT_ORDERS_ACTION.test(input)) {
        const nextInput = input.replace(/^\/api\/orders\/current/, "/next/api/orders/current");
        return previousFetch.call(window, nextInput, init);
      }
      return previousFetch.call(window, input, init);
    }

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = previousFetch;
    };
  }, []);

  return <CurrentOrdersClient {...props} />;
}
