import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/errors";
import type { Rule, RuleCreate, RuleType, RuleUpdate } from "../types";

export interface RulesState {
  rules: Rule[];
  types: RuleType[];
  loading: boolean;
  error: string | null;
}

/**
 * Rules and rule types, plus CRUD. `createRule` / `updateRule` re-throw so a form can show
 * the server's validation message; toggle and delete report failures through `error`.
 */
export function useRules() {
  const [state, setState] = useState<RulesState>({ rules: [], types: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.rules(), api.ruleTypes()])
      .then(([rules, types]) => !cancelled && setState({ rules, types, loading: false, error: null }))
      .catch((err: unknown) => !cancelled && setState((s) => ({ ...s, loading: false, error: errorMessage(err) })));
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const rules = await api.rules();
      setState((s) => ({ ...s, rules, error: null }));
    } catch (err) {
      setState((s) => ({ ...s, error: errorMessage(err) }));
    }
  }, []);

  const createRule = useCallback(
    async (input: RuleCreate) => {
      await api.createRule(input);
      await reload();
    },
    [reload],
  );

  const updateRule = useCallback(
    async (id: number, changes: RuleUpdate) => {
      await api.updateRule(id, changes);
      await reload();
    },
    [reload],
  );

  const guarded = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
        await reload();
      } catch (err) {
        setState((s) => ({ ...s, error: errorMessage(err) }));
      }
    },
    [reload],
  );

  const toggleRule = useCallback(
    (rule: Rule) => guarded(() => api.updateRule(rule.id, { enabled: !rule.enabled })),
    [guarded],
  );
  const deleteRule = useCallback((rule: Rule) => guarded(() => api.deleteRule(rule.id)), [guarded]);
  const dismissError = useCallback(() => setState((s) => ({ ...s, error: null })), []);

  return { ...state, reload, createRule, updateRule, toggleRule, deleteRule, dismissError };
}
