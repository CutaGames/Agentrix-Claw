import { useEffect, useState } from "react";
import { llmRouterApi, type RouterModel } from "../lib/api/llm-router.api";

export interface ModelPickerProps {
  /** currently selected model id; pass "auto" for default. */
  value: string;
  onChange: (modelId: string) => void;
  className?: string;
  /** Override the inner <select> classes. Defaults to a light theme. */
  selectClassName?: string;
  /** Optional label shown above the select. */
  label?: string;
}

/**
 * Model picker with `Auto` as the default option.
 *
 * Sends `model: "auto"` to the backend, which classifies the prompt and
 * picks the cheapest adequate model per request. Users keep the option to
 * pin a specific model from the catalog.
 */
export function ModelPicker({ value, onChange, className, selectClassName, label }: ModelPickerProps) {
  const [models, setModels] = useState<RouterModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    llmRouterApi
      .models()
      .then((data) => {
        if (cancelled) return;
        setModels(data?.models ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label className={className}>
      {label && (
        <span className="block text-xs font-medium text-agentrix-inkSoft mb-1">
          {label}
        </span>
      )}
      <select
        value={value || "auto"}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className={
          selectClassName ||
          "w-full rounded-lg border border-agentrix-inkLine bg-agentrix-mist px-3 py-2 text-sm text-agentrix-ink focus:border-agentrix-purple focus:outline-none"
        }
      >
        <option value="auto">⚡ Auto — pick the cheapest adequate model</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} · ${m.cost.inputPer1M.toFixed(2)}/${m.cost.outputPer1M.toFixed(2)} per 1M
          </option>
        ))}
      </select>
    </label>
  );
}
