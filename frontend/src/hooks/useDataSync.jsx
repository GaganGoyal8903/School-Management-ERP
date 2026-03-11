import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

const integrationSchema = z.object({
  status: z.string().default("Connected"),
  health: z.number().min(0).max(100).default(0),
  lastSynced: z.string().default("-"),
});

const aiUsageSchema = z.array(
  z.object({
    name: z.string(),
    tasks: z.number().default(0),
    timeSaved: z.number().default(0),
  }),
).default([]);

function useDataSync(syncApi, { auto = true, intervalMs = 45000 } = {}) {
  const [sources, setSources] = useState({
    jira: { status: "Connected", health: 96, lastSynced: "-" },
    github: { status: "Connected", health: 92, lastSynced: "-" },
  });
  const [aiUsage, setAiUsage] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(
    async (signal) => {
      setLoading(true);
      setError("");
      try {
        const [jiraRaw, githubRaw, aiRaw] = await Promise.all([
          syncApi("/integrations/sync?source=jira", { signal }),
          syncApi("/integrations/sync?source=github", { signal }),
          syncApi("/integrations/ai-usage", { signal }),
        ]);
        if (signal?.aborted) return;
        const jira = integrationSchema.parse(jiraRaw);
        const github = integrationSchema.parse(githubRaw);
        const ai = aiUsageSchema.parse(aiRaw).map((item) => ({
          ...item,
          // Data integrity fallback: missing/invalid values become 0
          timeSaved: Number(item.timeSaved || 0),
        }));
        setSources({
          jira: {
            status: jira.status,
            health: jira.health,
            lastSynced: jira.lastSynced,
          },
          github: {
            status: github.status,
            health: github.health,
            lastSynced: github.lastSynced,
          },
        });
        setAiUsage(ai);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err.message || "Sync failed");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [syncApi],
  );

  useEffect(() => {
    if (!auto) return undefined;
    const controller = new AbortController();
    refresh(controller.signal);
    const interval = setInterval(() => {
      const cycleController = new AbortController();
      refresh(cycleController.signal);
      setTimeout(() => cycleController.abort(), 5000);
    }, intervalMs);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [auto, intervalMs, refresh]);

  return { sources, aiUsage, loading, error, refresh };
}

export default useDataSync;
