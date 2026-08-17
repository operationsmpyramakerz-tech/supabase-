"use client";

import { useCallback, useRef, useState } from "react";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useActionLoading() {
  const [state, setState] = useState({
    open: false,
    status: "idle",
    title: "Working",
    message: "Please wait…",
  });
  const startedAtRef = useRef(0);

  const startActionLoading = useCallback(({ title = "Working", message = "Please wait…" } = {}) => {
    startedAtRef.current = Date.now();
    setState({ open: true, status: "loading", title, message });
  }, []);

  const finishActionLoading = useCallback(async (status = "done", message = "") => {
    const elapsed = Date.now() - (startedAtRef.current || Date.now());
    if (elapsed < 420) await wait(420 - elapsed);
    const failed = status === "failed";
    setState((current) => ({
      ...current,
      open: true,
      status: failed ? "failed" : "done",
      title: failed ? "Failed" : "Done",
      message: message || (failed ? "The action could not be completed." : "Completed successfully."),
    }));
    await wait(failed ? 1300 : 720);
    setState((current) => ({ ...current, open: false }));
  }, []);

  return { actionLoading: state, startActionLoading, finishActionLoading };
}

export default function ActionLoadingModal({ state }) {
  if (!state?.open) return null;
  const status = state.status || "loading";

  return (
    <div className="action-loading-overlay" role="presentation">
      <section className={`action-loading-modal is-${status}`} role="status" aria-live="polite" aria-label={state.title || "Loading"}>
        <div className="action-loading-visual" aria-hidden="true">
          {status === "loading" ? (
            <div className="action-loading-spinner">
              <span className="action-loading-spinner__ring" />
              <span className="action-loading-spinner__core">+</span>
            </div>
          ) : (
            <span className={`action-loading-result action-loading-result--${status}`}>{status === "done" ? "✓" : "×"}</span>
          )}
        </div>
        <div className="action-loading-copy">
          <strong>{state.title || (status === "loading" ? "Working" : status === "done" ? "Done" : "Failed")}</strong>
          <span>{state.message || (status === "loading" ? "Please wait…" : "")}</span>
        </div>
        {status === "loading" ? <div className="action-loading-dots" aria-hidden="true"><i /><i /><i /></div> : null}
      </section>
    </div>
  );
}
