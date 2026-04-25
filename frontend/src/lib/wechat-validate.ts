// Thin typed client for POST /api/v1/wechat/validate.
//
// Re-exports the finding types the rest of the UI already consumes from
// ``components/validation/types`` so there is exactly one source of truth
// for the validator shape. ``ValidationIssue`` / ``ValidationWarning`` are
// nominal aliases — the backend treats them as the same record schema but
// the UI benefits from the distinction when reading call sites.
//
// Fails open: if the validator endpoint is down or returns malformed data
// we resolve to ``{ok: false, error}`` so the caller can log + proceed
// instead of wedging the editor.

import api from "@/lib/api";
import type { ApiResponse } from "@/types";
import type { ValidationFinding, ValidationReport } from "@/components/validation/types";

export type ValidationIssue = ValidationFinding;
export type ValidationWarning = ValidationFinding;
export type { ValidationFinding, ValidationReport };

export interface ValidateSuccess {
  ok: true;
  report: ValidationReport;
}

export interface ValidateFailure {
  ok: false;
  error: string;
}

export type ValidateResult = ValidateSuccess | ValidateFailure;

const EMPTY_STATS = {
  svg_count: 0,
  animate_count: 0,
  animate_transform_count: 0,
  set_count: 0,
  anchor_count: 0,
};

function isFindingArray(value: unknown): value is ValidationFinding[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (entry === null || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      typeof record.rule === "string" &&
      typeof record.message === "string" &&
      typeof record.suggestion === "string" &&
      (typeof record.line === "number" || typeof record.line === "undefined")
    );
  });
}

function normalizeReport(raw: unknown): ValidationReport | null {
  if (raw === null || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!isFindingArray(record.issues)) return null;
  if (!isFindingArray(record.warnings)) return null;
  const stats =
    record.stats && typeof record.stats === "object"
      ? { ...EMPTY_STATS, ...(record.stats as Record<string, number>) }
      : EMPTY_STATS;
  return {
    issues: record.issues,
    warnings: record.warnings,
    stats,
  };
}

export interface ValidateOptions {
  /** AbortSignal from the caller (e.g. debounced hook) for cancellation. */
  signal?: AbortSignal;
}

/**
 * Call the WeChat compatibility validator.
 *
 * Never throws. Network/server failures resolve to ``{ok: false, error}``.
 */
export async function validateWechatHtml(
  html: string,
  options: ValidateOptions = {},
): Promise<ValidateResult> {
  try {
    const res = await api.post<ApiResponse<ValidationReport>>(
      "/wechat/validate",
      { html },
      { signal: options.signal },
    );
    if (res.data.code !== 0) {
      return { ok: false, error: res.data.message || "校验服务返回错误" };
    }
    const report = normalizeReport(res.data.data);
    if (!report) {
      return { ok: false, error: "校验服务返回格式错误" };
    }
    return { ok: true, report };
  } catch (error) {
    if (error instanceof Error) {
      // Axios marks cancelled requests with ``name === 'CanceledError'``.
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return { ok: false, error: "aborted" };
      }
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "校验服务不可用" };
  }
}

export function reportIsBlocking(report: ValidationReport): boolean {
  return report.issues.length > 0;
}

export function reportIsEmpty(report: ValidationReport): boolean {
  return report.issues.length === 0 && report.warnings.length === 0;
}
