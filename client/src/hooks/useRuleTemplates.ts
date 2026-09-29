import { useCallback, useEffect, useState } from "react";
import { api, isMissingEndpoint } from "../api";
import { errorMessage } from "../lib/errors";
import { sampleResultMessage } from "../lib/templates";
import type { RuleTemplate } from "../types";

/** `unavailable` => this server has no template endpoints (404/405); the UI hides the template features. */
export type TemplatesStatus = "loading" | "ready" | "unavailable" | "error";

export interface TemplatesState {
  templates: RuleTemplate[];
  status: TemplatesStatus;
  error: string | null;
}

export interface SamplesState {
  loading: boolean;
  /** e.g. "3 added, 2 already present" */
  message: string | null;
  error: string | null;
}

export const SAMPLES_UNAVAILABLE = "Sample rules are not available on this server.";

/**
 * Rule templates (`GET /api/rules/templates`) and the sample set (`POST /api/rules/samples`).
 * `onRulesChanged` is called after samples were loaded so the rules list refreshes.
 */
export function useRuleTemplates(onRulesChanged: () => unknown) {
  const [state, setState] = useState<TemplatesState>({ templates: [], status: "loading", error: null });
  const [samples, setSamples] = useState<SamplesState>({ loading: false, message: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .ruleTemplates()
      .then((templates) => !cancelled && setState({ templates, status: "ready", error: null }))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(
          isMissingEndpoint(err)
            ? { templates: [], status: "unavailable", error: null }
            : { templates: [], status: "error", error: errorMessage(err) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    setAttempt((n) => n + 1);
  }, []);

  const loadSamples = useCallback(async () => {
    setSamples({ loading: true, message: null, error: null });
    try {
      const result = await api.loadSampleRules();
      setSamples({ loading: false, message: sampleResultMessage(result), error: null });
      await onRulesChanged();
    } catch (err) {
      setSamples({
        loading: false,
        message: null,
        error: isMissingEndpoint(err) ? SAMPLES_UNAVAILABLE : errorMessage(err),
      });
    }
  }, [onRulesChanged]);

  const dismissSamples = useCallback(() => setSamples({ loading: false, message: null, error: null }), []);

  return { ...state, retry, samples, loadSamples, dismissSamples };
}
