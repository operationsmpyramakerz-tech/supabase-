"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useSaveProgress() {
  const [state, setState] = useState({
    open: false,
    status: "idle",
    progress: 0,
    title: "Saving",
    message: "Please wait while your changes are saved.",
  });
  const timerRef = useRef(null);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopTimer(), [stopTimer]);

  const startSaveProgress = useCallback(({ title = "Saving", message = "Please wait while your changes are saved." } = {}) => {
    stopTimer();
    setState({ open: true, status: "saving", progress: 6, title, message });
    timerRef.current = setInterval(() => {
      setState((current) => {
        if (!current.open || current.status !== "saving" || current.progress >= 90) return current;
        const remaining = 90 - current.progress;
        const increment = Math.max(1, Math.ceil(remaining * 0.08));
        return { ...current, progress: Math.min(90, current.progress + increment) };
      });
    }, 180);
  }, [stopTimer]);

  const updateSaveProgress = useCallback((progress, message = "") => {
    const normalized = Math.max(0, Math.min(96, Math.round(Number(progress) || 0)));
    setState((current) => ({
      ...current,
      open: true,
      status: "saving",
      progress: Math.max(current.progress || 0, normalized),
      message: message || current.message,
    }));
  }, []);

  const finishSaveProgress = useCallback(async (status = "done", message = "") => {
    stopTimer();
    setState((current) => ({
      ...current,
      open: true,
      status: "saving",
      progress: 100,
      message: message || current.message,
    }));
    await wait(220);
    setState((current) => ({
      ...current,
      status: status === "failed" ? "failed" : "done",
      progress: 100,
      title: status === "failed" ? "Failed" : "Done",
      message: message || (status === "failed" ? "Your changes could not be saved." : "Your changes were saved successfully."),
    }));
    await wait(status === "failed" ? 1450 : 900);
    setState((current) => ({ ...current, open: false }));
  }, [stopTimer]);

  return { saveProgress: state, startSaveProgress, updateSaveProgress, finishSaveProgress };
}

export default function SaveProgressModal({ state }) {
  if (!state?.open) return null;
  const progress = Math.max(0, Math.min(100, Math.round(Number(state.progress) || 0)));
  const status = state.status || "saving";

  return (
    <div className="save-progress-overlay" role="presentation">
      <section className={`save-progress-modal is-${status}`} role="status" aria-live="polite" aria-label={status === "saving" ? `Saving ${progress}%` : state.title}>
        <div className="save-progress-ring-wrap">
          <div className="save-progress-ring" style={{ "--save-progress": `${progress * 3.6}deg` }}>
            <div className="save-progress-ring__inner">
              {status === "saving" ? (
                <span className="save-progress-percent">{progress}<small>%</small></span>
              ) : status === "done" ? (
                <span className="save-progress-result save-progress-result--done" aria-hidden="true">✓</span>
              ) : (
                <span className="save-progress-result save-progress-result--failed" aria-hidden="true">×</span>
              )}
            </div>
          </div>
        </div>
        <div className="save-progress-copy">
          <strong>{state.title || (status === "saving" ? "Saving" : status === "done" ? "Done" : "Failed")}</strong>
          <span>{state.message}</span>
        </div>
      </section>
    </div>
  );
}
