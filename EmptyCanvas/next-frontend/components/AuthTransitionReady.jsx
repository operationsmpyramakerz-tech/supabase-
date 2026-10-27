"use client";

import { useEffect } from "react";
import { finishAuthRouteTransition } from "../lib/auth-route-transition";

// Error/standalone screens have no nested AppShell to signal readiness.
export default function AuthTransitionReady() {
  useEffect(() => {
    finishAuthRouteTransition();
    // Standalone error/empty states have no AppShell registration callback.
    window.__opsFinishColdStart?.();
  }, []);
  return null;
}
