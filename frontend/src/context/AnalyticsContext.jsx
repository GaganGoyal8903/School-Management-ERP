import { createContext, useContext, useMemo, useState } from "react";

const AnalyticsContext = createContext(null);

const initialFilter = {
  project: "",
  category: "",
  aiAgent: "",
  developer: "",
};

export function AnalyticsProvider({ children }) {
  const [globalFilter, setGlobalFilterState] = useState(() => {
    const raw = localStorage.getItem("autovyn_active_filter");
    return raw ? JSON.parse(raw) : initialFilter;
  });

  const setGlobalFilter = (patch) => {
    setGlobalFilterState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem("autovyn_active_filter", JSON.stringify(next));
      return next;
    });
  };

  const clearGlobalFilter = () => {
    localStorage.setItem("autovyn_active_filter", JSON.stringify(initialFilter));
    setGlobalFilterState(initialFilter);
  };

  const value = useMemo(
    () => ({
      globalFilter,
      activeFilter: globalFilter,
      setGlobalFilter,
      clearGlobalFilter,
    }),
    [globalFilter],
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) throw new Error("useAnalytics must be used inside AnalyticsProvider");
  return context;
}
