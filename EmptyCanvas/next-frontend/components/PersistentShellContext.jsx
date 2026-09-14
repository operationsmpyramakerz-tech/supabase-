"use client";

import { createContext, useContext, useMemo } from "react";

const PersistentShellContext = createContext(null);

export function PersistentShellProvider({ registerPage, children }) {
  const value = useMemo(() => ({ persistent: true, registerPage }), [registerPage]);
  return (
    <PersistentShellContext.Provider value={value}>
      {children}
    </PersistentShellContext.Provider>
  );
}

export function usePersistentShellContext() {
  return useContext(PersistentShellContext);
}
