/**
 * Quota configuration definitions.
 */

import React from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type {
  AntigravityQuotaGroup,
  AntigravityModelsPayload,
  AntigravityQuotaState,
  AuthFileItem,
  ClaudeExtraUsage,
  ClaudeQuotaState,
  ClaudeQuotaWindow,
  ClaudeUsagePayload,
  CodexRateLimitInfo,
  CodexQuotaState,
  CodexUsageWindow,
  CodexQuotaWindow,
  CodexUsagePayload,
  GeminiCliParsedBucket,
  GeminiCliQuotaBucketState,
  GeminiCliQuotaState,
  KiroQuotaState,
  GithubCopilotQuotaState,
  KiroBaseQuota,
  KiroFreeTrialQuota,
} from '@/types';
import { apiCallApi, authFilesApi, getApiCallErrorMessage } from '@/services/api';
import {
  ANTIGRAVITY_QUOTA_URLS,
  ANTIGRAVITY_REQUEST_HEADERS,
  CLAUDE_USAGE_URL,
  CLAUDE_REQUEST_HEADERS,
  CLAUDE_USAGE_WINDOW_KEYS,
  CODEX_USAGE_URL,
  CODEX_REQUEST_HEADERS,
  GEMINI_CLI_QUOTA_URL,
  GEMINI_CLI_REQUEST_HEADERS,
  KIRO_QUOTA_URL,
  KIRO_REQUEST_HEADERS,
  GITHUB_COPILOT_USAGE_URL,
  GITHUB_COPILOT_REQUEST_HEADERS,
  KIRO_REQUEST_BODY,
  normalizeGeminiCliModelId,
  normalizeNumberValue,
  normalizePlanType,
  normalizeQuotaFraction,
  normalizeStringValue,
  parseAntigravityPayload,
  parseClaudeUsagePayload,
  parseCodexUsagePayload,
  parseGeminiCliQuotaPayload,
  parseKiroQuotaPayload,
  parseGithubCopilotTokenPayload,
  parseKiroErrorPayload,
  resolveCodexChatgptAccountId,
  resolveCodexPlanType,
  resolveGeminiCliProjectId,
  formatCodexResetLabel,
  formatQuotaResetTime,
  buildAntigravityQuotaGroups,
  buildGeminiCliQuotaBuckets,
  createStatusError,
  getStatusFromError,
  isAntigravityFile,
  isClaudeFile,
  isCodexFile,
  isDisabledAuthFile,
  isGeminiCliFile,
  isKiroFile,
  isGithubCopilotFile,
  isRuntimeOnlyAuthFile,
} from '@/utils/quota';
import { normalizeAuthIndex } from '@/utils/usage';
import type { QuotaRenderHelpers } from './QuotaCard';
import styles from '@/pages/QuotaPage.module.scss';

type QuotaUpdater<T> = T | ((prev: T) => T);

type QuotaType = 'antigravity' | 'claude' | 'codex' | 'gemini-cli' | 'kiro' | 'github-copilot';

const DEFAULT_ANTIGRAVITY_PROJECT_ID = 'bamboo-precept-lgxtn';

export interface QuotaStore {
  antigravityQuota: Record<string, AntigravityQuotaState>;
  claudeQuota: Record<string, ClaudeQuotaState>;
  codexQuota: Record<string, CodexQuotaState>;
  geminiCliQuota: Record<string, GeminiCliQuotaState>;
  kiroQuota: Record<string, KiroQuotaState>;
  githubCopilotQuota: Record<string, GithubCopilotQuotaState>;
  setAntigravityQuota: (updater: QuotaUpdater<Record<string, AntigravityQuotaState>>) => void;
  setClaudeQuota: (updater: QuotaUpdater<Record<string, ClaudeQuotaState>>) => void;
  setCodexQuota: (updater: QuotaUpdater<Record<string, CodexQuotaState>>) => void;
  setGeminiCliQuota: (updater: QuotaUpdater<Record<string, GeminiCliQuotaState>>) => void;
  setKiroQuota: (updater: QuotaUpdater<Record<string, KiroQuotaState>>) => void;
  setGithubCopilotQuota: (updater: QuotaUpdater<Record<string, GithubCopilotQuotaState>>) => void;
  clearQuotaCache: () => void;
}

export interface QuotaConfig<TState, TData> {
  type: QuotaType;
  i18nPrefix: string;
  cardIdleMessageKey?: string;
  filterFn: (file: AuthFileItem) => boolean;
  fetchQuota: (file: AuthFileItem, t: TFunction) => Promise<TData>;
  storeSelector: (state: QuotaStore) => Record<string, TState>;
  storeSetter: keyof QuotaStore;
  buildLoadingState: () => TState;
  buildSuccessState: (data: TData) => TState;
  buildErrorState: (message: string, status?: number) => TState;
  cardClassName: string;
  controlsClassName: string;
  controlClassName: string;
  gridClassName: string;
  renderQuotaItems: (quota: TState, t: TFunction, helpers: QuotaRenderHelpers) => ReactNode;
}

const resolveAntigravityProjectId = async (file: AuthFileItem): Promise<string> => {
  try {
    const text = await authFilesApi.downloadText(file.name);
    const trimmed = text.trim();
    if (!trimmed) return DEFAULT_ANTIGRAVITY_PROJECT_ID;

    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const topLevel = normalizeStringValue(parsed.project_id ?? parsed.projectId);
    if (topLevel) return topLevel;

    const installed =
      parsed.installed && typeof parsed.installed === 'object' && parsed.installed !== null
        ? (parsed.installed as Record<string, unknown>)
        : null;
    const installedProjectId = installed
      ? normalizeStringValue(installed.project_id ?? installed.projectId)
      : null;
    if (installedProjectId) return installedProjectId;

    const web =
      parsed.web && typeof parsed.web === 'object' && parsed.web !== null
        ? (parsed.web as Record<string, unknown>)
        : null;
    const webProjectId = web ? normalizeStringValue(web.project_id ?? web.projectId) : null;
    if (webProjectId) return webProjectId;
  } catch {
    return DEFAULT_ANTIGRAVITY_PROJECT_ID;
  }

  return DEFAULT_ANTIGRAVITY_PROJECT_ID;
};

const fetchAntigravityQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<AntigravityQuotaGroup[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('antigravity_quota.missing_auth_index'));
  }

  const projectId = await resolveAntigravityProjectId(file);
  const requestBody = JSON.stringify({ project: projectId });

  let lastError = '';
  let lastStatus: number | undefined;
  let priorityStatus: number | undefined;
  let hadSuccess = false;

  for (const url of ANTIGRAVITY_QUOTA_URLS) {
    try {
      const result = await apiCallApi.request({
        authIndex,
        method: 'POST',
        url,
        header: { ...ANTIGRAVITY_REQUEST_HEADERS },
        data: requestBody,
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        lastError = getApiCallErrorMessage(result);
        lastStatus = result.statusCode;
        if (result.statusCode === 403 || result.statusCode === 404) {
          priorityStatus ??= result.statusCode;
        }
        continue;
      }

      hadSuccess = true;
      const payload = parseAntigravityPayload(result.body ?? result.bodyText);
      const models = payload?.models;
      if (!models || typeof models !== 'object' || Array.isArray(models)) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      const groups = buildAntigravityQuotaGroups(models as AntigravityModelsPayload);
      if (groups.length === 0) {
        lastError = t('antigravity_quota.empty_models');
        continue;
      }

      return groups;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : t('common.unknown_error');
      const status = getStatusFromError(err);
      if (status) {
        lastStatus = status;
        if (status === 403 || status === 404) {
          priorityStatus ??= status;
        }
      }
    }
  }

  if (hadSuccess) {
    return [];
  }

  throw createStatusError(lastError || t('common.unknown_error'), priorityStatus ?? lastStatus);
};

const buildCodexQuotaWindows = (payload: CodexUsagePayload, t: TFunction): CodexQuotaWindow[] => {
  const FIVE_HOUR_SECONDS = 18000;
  const WEEK_SECONDS = 604800;
  const WINDOW_META = {
    codeFiveHour: { id: 'five-hour', labelKey: 'codex_quota.primary_window' },
    codeWeekly: { id: 'weekly', labelKey: 'codex_quota.secondary_window' },
    codeReviewFiveHour: { id: 'code-review-five-hour', labelKey: 'codex_quota.code_review_primary_window' },
    codeReviewWeekly: { id: 'code-review-weekly', labelKey: 'codex_quota.code_review_secondary_window' },
  } as const;

  const rateLimit = payload.rate_limit ?? payload.rateLimit ?? undefined;
  const codeReviewLimit = payload.code_review_rate_limit ?? payload.codeReviewRateLimit ?? undefined;
  const additionalRateLimits = payload.additional_rate_limits ?? payload.additionalRateLimits ?? [];
  const windows: CodexQuotaWindow[] = [];

  const addWindow = (
    id: string,
    label: string,
    labelKey: string | undefined,
    labelParams: Record<string, string | number> | undefined,
    window?: CodexUsageWindow | null,
    limitReached?: boolean,
    allowed?: boolean
  ) => {
    if (!window) return;
    const resetLabel = formatCodexResetLabel(window);
    const usedPercentRaw = normalizeNumberValue(window.used_percent ?? window.usedPercent);
    const isLimitReached = Boolean(limitReached) || allowed === false;
    const usedPercent = usedPercentRaw ?? (isLimitReached && resetLabel !== '-' ? 100 : null);
    windows.push({
      id,
      label,
      labelKey,
      labelParams,
      usedPercent,
      resetLabel,
    });
  };

  const getWindowSeconds = (window?: CodexUsageWindow | null): number | null => {
    if (!window) return null;
    return normalizeNumberValue(window.limit_window_seconds ?? window.limitWindowSeconds);
  };

  const rawLimitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const rawAllowed = rateLimit?.allowed;

  const pickClassifiedWindows = (
    limitInfo?: CodexRateLimitInfo | null,
    options?: { allowOrderFallback?: boolean }
  ): { fiveHourWindow: CodexUsageWindow | null; weeklyWindow: CodexUsageWindow | null } => {
    const allowOrderFallback = options?.allowOrderFallback ?? true;
    const primaryWindow = limitInfo?.primary_window ?? limitInfo?.primaryWindow ?? null;
    const secondaryWindow = limitInfo?.secondary_window ?? limitInfo?.secondaryWindow ?? null;
    const rawWindows = [primaryWindow, secondaryWindow];

    let fiveHourWindow: CodexUsageWindow | null = null;
    let weeklyWindow: CodexUsageWindow | null = null;

    for (const window of rawWindows) {
      if (!window) continue;
      const seconds = getWindowSeconds(window);
      if (seconds === FIVE_HOUR_SECONDS && !fiveHourWindow) {
        fiveHourWindow = window;
      } else if (seconds === WEEK_SECONDS && !weeklyWindow) {
        weeklyWindow = window;
      }
    }

    // For legacy payloads without window duration, fallback to primary/secondary ordering.
    if (allowOrderFallback) {
      if (!fiveHourWindow) {
        fiveHourWindow = primaryWindow && primaryWindow !== weeklyWindow ? primaryWindow : null;
      }
      if (!weeklyWindow) {
        weeklyWindow = secondaryWindow && secondaryWindow !== fiveHourWindow ? secondaryWindow : null;
      }
    }

    return { fiveHourWindow, weeklyWindow };
  };

  const rateWindows = pickClassifiedWindows(rateLimit);
  addWindow(
    WINDOW_META.codeFiveHour.id,
    t(WINDOW_META.codeFiveHour.labelKey),
    WINDOW_META.codeFiveHour.labelKey,
    undefined,
    rateWindows.fiveHourWindow,
    rawLimitReached,
    rawAllowed
  );
  addWindow(
    WINDOW_META.codeWeekly.id,
    t(WINDOW_META.codeWeekly.labelKey),
    WINDOW_META.codeWeekly.labelKey,
    undefined,
    rateWindows.weeklyWindow,
    rawLimitReached,
    rawAllowed
  );

  const codeReviewWindows = pickClassifiedWindows(codeReviewLimit);
  const codeReviewLimitReached = codeReviewLimit?.limit_reached ?? codeReviewLimit?.limitReached;
  const codeReviewAllowed = codeReviewLimit?.allowed;
  addWindow(
    WINDOW_META.codeReviewFiveHour.id,
    t(WINDOW_META.codeReviewFiveHour.labelKey),
    WINDOW_META.codeReviewFiveHour.labelKey,
    undefined,
    codeReviewWindows.fiveHourWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );
  addWindow(
    WINDOW_META.codeReviewWeekly.id,
    t(WINDOW_META.codeReviewWeekly.labelKey),
    WINDOW_META.codeReviewWeekly.labelKey,
    undefined,
    codeReviewWindows.weeklyWindow,
    codeReviewLimitReached,
    codeReviewAllowed
  );

  const normalizeWindowId = (raw: string) =>
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

  if (Array.isArray(additionalRateLimits)) {
    additionalRateLimits.forEach((limitItem, index) => {
      const rateInfo = limitItem?.rate_limit ?? limitItem?.rateLimit ?? null;
      if (!rateInfo) return;

      const limitName =
        normalizeStringValue(limitItem?.limit_name ?? limitItem?.limitName) ??
        normalizeStringValue(limitItem?.metered_feature ?? limitItem?.meteredFeature) ??
        `additional-${index + 1}`;

      const idPrefix = normalizeWindowId(limitName) || `additional-${index + 1}`;
      const additionalPrimaryWindow = rateInfo.primary_window ?? rateInfo.primaryWindow ?? null;
      const additionalSecondaryWindow = rateInfo.secondary_window ?? rateInfo.secondaryWindow ?? null;
      const additionalLimitReached = rateInfo.limit_reached ?? rateInfo.limitReached;
      const additionalAllowed = rateInfo.allowed;

      addWindow(
        `${idPrefix}-five-hour-${index}`,
        t('codex_quota.additional_primary_window', { name: limitName }),
        'codex_quota.additional_primary_window',
        { name: limitName },
        additionalPrimaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
      addWindow(
        `${idPrefix}-weekly-${index}`,
        t('codex_quota.additional_secondary_window', { name: limitName }),
        'codex_quota.additional_secondary_window',
        { name: limitName },
        additionalSecondaryWindow,
        additionalLimitReached,
        additionalAllowed
      );
    });
  }

  return windows;
};

const fetchCodexQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{ planType: string | null; windows: CodexQuotaWindow[] }> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('codex_quota.missing_auth_index'));
  }

  const planTypeFromFile = resolveCodexPlanType(file);
  const accountId = resolveCodexChatgptAccountId(file);
  if (!accountId) {
    throw new Error(t('codex_quota.missing_account_id'));
  }

  const requestHeader: Record<string, string> = {
    ...CODEX_REQUEST_HEADERS,
    'Chatgpt-Account-Id': accountId,
  };

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: requestHeader,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('codex_quota.empty_windows'));
  }

  const planTypeFromUsage = normalizePlanType(payload.plan_type ?? payload.planType);
  const windows = buildCodexQuotaWindows(payload, t);
  return { planType: planTypeFromUsage ?? planTypeFromFile, windows };
};

const fetchGeminiCliQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<GeminiCliQuotaBucketState[]> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('gemini_cli_quota.missing_auth_index'));
  }

  const projectId = resolveGeminiCliProjectId(file);
  if (!projectId) {
    throw new Error(t('gemini_cli_quota.missing_project_id'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: GEMINI_CLI_QUOTA_URL,
    header: { ...GEMINI_CLI_REQUEST_HEADERS },
    data: JSON.stringify({ project: projectId }),
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseGeminiCliQuotaPayload(result.body ?? result.bodyText);
  const buckets = Array.isArray(payload?.buckets) ? payload?.buckets : [];
  if (buckets.length === 0) return [];

  const parsedBuckets = buckets
    .map((bucket) => {
      const modelId = normalizeGeminiCliModelId(bucket.modelId ?? bucket.model_id);
      if (!modelId) return null;
      const tokenType = normalizeStringValue(bucket.tokenType ?? bucket.token_type);
      const remainingFractionRaw = normalizeQuotaFraction(
        bucket.remainingFraction ?? bucket.remaining_fraction
      );
      const remainingAmount = normalizeNumberValue(
        bucket.remainingAmount ?? bucket.remaining_amount
      );
      const resetTime = normalizeStringValue(bucket.resetTime ?? bucket.reset_time) ?? undefined;
      let fallbackFraction: number | null = null;
      if (remainingAmount !== null) {
        fallbackFraction = remainingAmount <= 0 ? 0 : null;
      } else if (resetTime) {
        fallbackFraction = 0;
      }
      const remainingFraction = remainingFractionRaw ?? fallbackFraction;
      return {
        modelId,
        tokenType,
        remainingFraction,
        remainingAmount,
        resetTime,
      };
    })
    .filter((bucket): bucket is GeminiCliParsedBucket => bucket !== null);

  return buildGeminiCliQuotaBuckets(parsedBuckets);
};

const fetchGithubCopilotQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{
  expiresAt: number | null;
  refreshIn: number | null;
  chatQuota: number | null;
  chatPercent: number | null;
  chatUnlimited: boolean;
  completionsQuota: number | null;
  completionsPercent: number | null;
  completionsUnlimited: boolean;
  premiumQuota: number | null;
  premiumPercent: number | null;
  premiumEntitlement: number | null;
  quotaResetDate: number | null;
  sku: string | null;
}> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndexValue(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('github_copilot_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: GITHUB_COPILOT_USAGE_URL,
    header: { ...GITHUB_COPILOT_REQUEST_HEADERS }
  });

  // console.log('Github Copilot quota API result:', result);
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseGithubCopilotTokenPayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('github_copilot_quota.invalid_response'));
  }

  const expiresAt = normalizeNumberValue(payload.expires_at ?? payload.expiresAt);
  const refreshIn = normalizeNumberValue(payload.refresh_in ?? payload.refreshIn);
  
  // Extract quota snapshots (new structure)
  const quotaSnapshots = payload.quota_snapshots ?? payload.quotaSnapshots;
  let chatQuota: number | null = null;
  let chatPercent: number | null = null;
  let chatUnlimited = false;
  let completionsQuota: number | null = null;
  let completionsPercent: number | null = null;
  let completionsUnlimited = false;
  let premiumQuota: number | null = null;
  let premiumPercent: number | null = null;
  let premiumEntitlement: number | null = null;
  
  if (quotaSnapshots && typeof quotaSnapshots === 'object') {
    // Try to get from quota_snapshots first
    const snapshots = quotaSnapshots as Record<string, unknown>;
    const chatSnapshot = snapshots.chat;
    const completionsSnapshot = snapshots.completions;
    const premiumSnapshot = snapshots.premium_interactions ?? snapshots.premiumInteractions;
    
    if (chatSnapshot && typeof chatSnapshot === 'object') {
      const chatSnapshotObj = chatSnapshot as Record<string, unknown>;
      chatQuota = normalizeNumberValue(
        chatSnapshotObj.quota_remaining ??
        chatSnapshotObj.quotaRemaining ??
        chatSnapshotObj.remaining
      );
      chatPercent = normalizeNumberValue(
        chatSnapshotObj.percent_remaining ??
        chatSnapshotObj.percentRemaining
      );
      chatUnlimited = Boolean(chatSnapshotObj.unlimited);
    }
    
    if (completionsSnapshot && typeof completionsSnapshot === 'object') {
      const completionsSnapshotObj = completionsSnapshot as Record<string, unknown>;
      completionsQuota = normalizeNumberValue(
        completionsSnapshotObj.quota_remaining ??
        completionsSnapshotObj.quotaRemaining ??
        completionsSnapshotObj.remaining
      );
      completionsPercent = normalizeNumberValue(
        completionsSnapshotObj.percent_remaining ??
        completionsSnapshotObj.percentRemaining
      );
      completionsUnlimited = Boolean(completionsSnapshotObj.unlimited);
    }
    
    if (premiumSnapshot && typeof premiumSnapshot === 'object') {
      const premiumSnapshotObj = premiumSnapshot as Record<string, unknown>;
      premiumQuota = normalizeNumberValue(
        premiumSnapshotObj.quota_remaining ??
        premiumSnapshotObj.quotaRemaining ??
        premiumSnapshotObj.remaining
      );
      premiumPercent = normalizeNumberValue(
        premiumSnapshotObj.percent_remaining ??
        premiumSnapshotObj.percentRemaining
      );
      premiumEntitlement = normalizeNumberValue(
        premiumSnapshotObj.entitlement
      );
    }
  }
  
  // Fallback to legacy limited_user_quotas if quota_snapshots not available
  if (chatQuota === null || completionsQuota === null) {
    const quotas = payload.limited_user_quotas ?? payload.limitedUserQuotas;
    if (quotas && typeof quotas === 'object') {
      if (chatQuota === null) {
        chatQuota = normalizeNumberValue(quotas.chat);
      }
      if (completionsQuota === null) {
        completionsQuota = normalizeNumberValue(quotas.completions);
      }
    }
  }
  
  // Extract reset date (prefer quota_reset_date for enterprise, fallback to limited_user_reset_date)
  let quotaResetDate: number | null = null;
  const quotaResetDateStr = normalizeStringValue(
    payload.quota_reset_date ?? payload.quotaResetDate
  );
  const limitedResetDate = normalizeNumberValue(
    payload.limited_user_reset_date ?? payload.limitedUserResetDate
  );
  
  if (quotaResetDateStr) {
    // Parse ISO 8601 date string to Unix timestamp
    const parsedDate = new Date(quotaResetDateStr);
    if (!isNaN(parsedDate.getTime())) {
      quotaResetDate = Math.floor(parsedDate.getTime() / 1000);
    }
  } else if (limitedResetDate !== null) {
    quotaResetDate = limitedResetDate;
  }
  
  const sku = normalizeStringValue(
    payload.sku ??
      payload.access_type_sku ??
      payload.accessTypeSku ??
      payload.copilot_plan ??
      payload.copilotPlan ??
      payload.plan ??
      payload.plan_type ??
      payload.planType ??
      payload.subscription ??
      payload.subscription_type ??
      payload.subscriptionType ??
      payload.license ??
      payload.license_type ??
      payload.licenseType
  );

  return {
    expiresAt,
    refreshIn,
    chatQuota,
    chatPercent,
    chatUnlimited,
    completionsQuota,
    completionsPercent,
    completionsUnlimited,
    premiumQuota,
    premiumPercent,
    premiumEntitlement,
    quotaResetDate,
    sku
  };
};

const renderAntigravityItems = (
  quota: AntigravityQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const groups = quota.groups ?? [];

  if (groups.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('antigravity_quota.empty_models'));
  }

  return groups.map((group) => {
    const clamped = Math.max(0, Math.min(1, group.remainingFraction));
    const percent = Math.round(clamped * 100);
    const resetLabel = formatQuotaResetTime(group.resetTime);

    return h(
      'div',
      { key: group.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel, title: group.models.join(', ') }, group.label),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, `${percent}%`),
          h('span', { className: styleMap.quotaReset }, resetLabel)
        )
      ),
      h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
    );
  });
};

const renderCodexItems = (
  quota: CodexQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const planType = quota.planType ?? null;

  const getPlanLabel = (pt?: string | null): string | null => {
    const normalized = normalizePlanType(pt);
    if (!normalized) return null;
    if (normalized === 'plus') return t('codex_quota.plan_plus');
    if (normalized === 'team') return t('codex_quota.plan_team');
    if (normalized === 'free') return t('codex_quota.plan_free');
    return pt || normalized;
  };

  const planLabel = getPlanLabel(planType);
  const nodes: ReactNode[] = [];

  if (planLabel) {
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('codex_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, planLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('codex_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey
        ? t(window.labelKey, window.labelParams as Record<string, string | number>)
        : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent: remaining, highThreshold: 80, mediumThreshold: 50 })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

const renderGeminiCliItems = (
  quota: GeminiCliQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h } = React;
  const buckets = quota.buckets ?? [];

  if (buckets.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('gemini_cli_quota.empty_buckets'));
  }

  return buckets.map((bucket) => {
    const fraction = bucket.remainingFraction;
    const clamped = fraction === null ? null : Math.max(0, Math.min(1, fraction));
    const percent = clamped === null ? null : Math.round(clamped * 100);
    const percentLabel = percent === null ? '--' : `${percent}%`;
    const remainingAmountLabel =
      bucket.remainingAmount === null || bucket.remainingAmount === undefined
        ? null
        : t('gemini_cli_quota.remaining_amount', {
            count: bucket.remainingAmount,
          });
    const titleBase =
      bucket.modelIds && bucket.modelIds.length > 0 ? bucket.modelIds.join(', ') : bucket.label;
    const title = bucket.tokenType ? `${titleBase} (${bucket.tokenType})` : titleBase;

    const resetLabel = formatQuotaResetTime(bucket.resetTime);

    return h(
      'div',
      { key: bucket.id, className: styleMap.quotaRow },
      h(
        'div',
        { className: styleMap.quotaRowHeader },
        h('span', { className: styleMap.quotaModel, title }, bucket.label),
        h(
          'div',
          { className: styleMap.quotaMeta },
          h('span', { className: styleMap.quotaPercent }, percentLabel),
          remainingAmountLabel
            ? h('span', { className: styleMap.quotaAmount }, remainingAmountLabel)
            : null,
          h('span', { className: styleMap.quotaReset }, resetLabel)
        )
      ),
      h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
    );
  });
};

const renderGithubCopilotItems = (
  quota: GithubCopilotQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;

  const {
    expiresAt,
    refreshIn,
    chatQuota,
    chatPercent,
    chatUnlimited,
    completionsQuota,
    completionsPercent,
    completionsUnlimited,
    premiumQuota,
    premiumPercent,
    premiumEntitlement,
    quotaResetDate,
    sku
  } = quota;

  // Check if we have any data to display
  const hasData =
    expiresAt !== null ||
    refreshIn !== null ||
    chatQuota !== null ||
    completionsQuota !== null ||
    premiumQuota !== null ||
    quotaResetDate !== null ||
    sku !== null;

  if (!hasData) {
    return h(
      'div',
      { className: styleMap.quotaMessage },
      t('github_copilot_quota.no_data')
    );
  }

  const getPlanLabel = (skuValue?: string | null): string => {
    if (!skuValue) return t('github_copilot_quota.plan_unknown');
    const normalized = skuValue.toLowerCase();
    if (normalized.includes('enterprise')) return t('github_copilot_quota.plan_enterprise');
    if (normalized.includes('business') || normalized.includes('team')) {
      return t('github_copilot_quota.plan_business');
    }
    if (normalized.includes('individual') || normalized.includes('personal') || normalized.includes('pro')) {
      return t('github_copilot_quota.plan_individual');
    }
    if (normalized.includes('free') || normalized.includes('trial')) {
      return t('github_copilot_quota.plan_free_limited');
    }
    return skuValue;
  };

  const nodes: ReactNode[] = [];

  // Display SKU/Plan badge if available
  if (sku) {
    nodes.push(
      h(
        'div',
        { key: 'plan', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('github_copilot_quota.plan_label')),
        h('span', { className: styleMap.codexPlanValue }, getPlanLabel(sku))
      )
    );
  }

  const resetLabel = quotaResetDate !== null
    ? new Date(quotaResetDate * 1000).toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '-';

  // Display Chat Quota with limit and progress bar
  if (chatQuota !== null || chatUnlimited) {
    const percent = chatUnlimited ? 100 : (chatPercent !== null ? Math.round(chatPercent) : null);
    const percentLabel = chatUnlimited ? 'Unlimited' : (percent !== null ? `${percent}%` : '--');
    
    nodes.push(
      h(
        'div',
        { key: 'chat-quota', className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, t('github_copilot_quota.chat_quota')),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
      )
    );
  }

  // Display Completions Quota with limit and progress bar
  if (completionsQuota !== null || completionsUnlimited) {
    const percent = completionsUnlimited ? 100 : (completionsPercent !== null ? Math.round(completionsPercent) : null);
    const percentLabel = completionsUnlimited ? 'Unlimited' : (percent !== null ? `${percent}%` : '--');
    
    nodes.push(
      h(
        'div',
        { key: 'completions-quota', className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, t('github_copilot_quota.completions_quota')),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
      )
    );
  }

  // Display Premium Interactions Quota (only if entitlement > 0)
  if (premiumEntitlement !== null && premiumEntitlement > 0 && premiumQuota !== null) {
    const percent = premiumPercent !== null ? Math.round(premiumPercent) : null;
    const percentLabel = percent !== null ? `${percent}%` : '--';
    
    nodes.push(
      h(
        'div',
        { key: 'premium-quota', className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, t('github_copilot_quota.premium_quota')),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
      )
    );
  }

  return h(Fragment, null, ...nodes);
};

const buildClaudeQuotaWindows = (
  payload: ClaudeUsagePayload,
  t: TFunction
): ClaudeQuotaWindow[] => {
  const windows: ClaudeQuotaWindow[] = [];

  for (const { key, id, labelKey } of CLAUDE_USAGE_WINDOW_KEYS) {
    const window = payload[key as keyof ClaudeUsagePayload];
    if (!window || typeof window !== 'object' || !('utilization' in window)) continue;
    const typedWindow = window as { utilization: number; resets_at: string };
    const usedPercent = normalizeNumberValue(typedWindow.utilization);
    const resetLabel = formatQuotaResetTime(typedWindow.resets_at);
    windows.push({
      id,
      label: t(labelKey),
      labelKey,
      usedPercent,
      resetLabel,
    });
  }

  return windows;
};

const fetchClaudeQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<{ windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null }> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('claude_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CLAUDE_USAGE_URL,
    header: { ...CLAUDE_REQUEST_HEADERS },
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseClaudeUsagePayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('claude_quota.empty_windows'));
  }

  const windows = buildClaudeQuotaWindows(payload, t);
  return { windows, extraUsage: payload.extra_usage };
};

const renderClaudeItems = (
  quota: ClaudeQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;
  const windows = quota.windows ?? [];
  const extraUsage = quota.extraUsage ?? null;
  const nodes: ReactNode[] = [];

  if (extraUsage && extraUsage.is_enabled) {
    const usedLabel = `$${(extraUsage.used_credits / 100).toFixed(2)} / $${(extraUsage.monthly_limit / 100).toFixed(2)}`;
    nodes.push(
      h(
        'div',
        { key: 'extra', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('claude_quota.extra_usage_label')),
        h('span', { className: styleMap.codexPlanValue }, usedLabel)
      )
    );
  }

  if (windows.length === 0) {
    nodes.push(
      h('div', { key: 'empty', className: styleMap.quotaMessage }, t('claude_quota.empty_windows'))
    );
    return h(Fragment, null, ...nodes);
  }

  nodes.push(
    ...windows.map((window) => {
      const used = window.usedPercent;
      const clampedUsed = used === null ? null : Math.max(0, Math.min(100, used));
      const remaining = clampedUsed === null ? null : Math.max(0, Math.min(100, 100 - clampedUsed));
      const percentLabel = remaining === null ? '--' : `${Math.round(remaining)}%`;
      const windowLabel = window.labelKey ? t(window.labelKey) : window.label;

      return h(
        'div',
        { key: window.id, className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, windowLabel),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, percentLabel),
            h('span', { className: styleMap.quotaReset }, window.resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent: remaining, highThreshold: 80, mediumThreshold: 50 })
      );
    })
  );

  return h(Fragment, null, ...nodes);
};

export const CLAUDE_CONFIG: QuotaConfig<
  ClaudeQuotaState,
  { windows: ClaudeQuotaWindow[]; extraUsage?: ClaudeExtraUsage | null }
> = {
  type: 'claude',
  i18nPrefix: 'claude_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isClaudeFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchClaudeQuota,
  storeSelector: (state) => state.claudeQuota,
  storeSetter: 'setClaudeQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    extraUsage: data.extraUsage,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.claudeCard,
  controlsClassName: styles.claudeControls,
  controlClassName: styles.claudeControl,
  gridClassName: styles.claudeGrid,
  renderQuotaItems: renderClaudeItems,
};

export const ANTIGRAVITY_CONFIG: QuotaConfig<AntigravityQuotaState, AntigravityQuotaGroup[]> = {
  type: 'antigravity',
  i18nPrefix: 'antigravity_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isAntigravityFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchAntigravityQuota,
  storeSelector: (state) => state.antigravityQuota,
  storeSetter: 'setAntigravityQuota',
  buildLoadingState: () => ({ status: 'loading', groups: [] }),
  buildSuccessState: (groups) => ({ status: 'success', groups }),
  buildErrorState: (message, status) => ({
    status: 'error',
    groups: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.antigravityCard,
  controlsClassName: styles.antigravityControls,
  controlClassName: styles.antigravityControl,
  gridClassName: styles.antigravityGrid,
  renderQuotaItems: renderAntigravityItems,
};

export const CODEX_CONFIG: QuotaConfig<
  CodexQuotaState,
  { planType: string | null; windows: CodexQuotaWindow[] }
> = {
  type: 'codex',
  i18nPrefix: 'codex_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) => isCodexFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchCodexQuota,
  storeSelector: (state) => state.codexQuota,
  storeSetter: 'setCodexQuota',
  buildLoadingState: () => ({ status: 'loading', windows: [] }),
  buildSuccessState: (data) => ({
    status: 'success',
    windows: data.windows,
    planType: data.planType,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    windows: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.codexCard,
  controlsClassName: styles.codexControls,
  controlClassName: styles.codexControl,
  gridClassName: styles.codexGrid,
  renderQuotaItems: renderCodexItems,
};

export const GEMINI_CLI_CONFIG: QuotaConfig<GeminiCliQuotaState, GeminiCliQuotaBucketState[]> = {
  type: 'gemini-cli',
  i18nPrefix: 'gemini_cli_quota',
  cardIdleMessageKey: 'quota_management.card_idle_hint',
  filterFn: (file) =>
    isGeminiCliFile(file) && !isRuntimeOnlyAuthFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchGeminiCliQuota,
  storeSelector: (state) => state.geminiCliQuota,
  storeSetter: 'setGeminiCliQuota',
  buildLoadingState: () => ({ status: 'loading', buckets: [] }),
  buildSuccessState: (buckets) => ({ status: 'success', buckets }),
  buildErrorState: (message, status) => ({
    status: 'error',
    buckets: [],
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.geminiCliCard,
  controlsClassName: styles.geminiCliControls,
  controlClassName: styles.geminiCliControl,
  gridClassName: styles.geminiCliGrid,
  renderQuotaItems: renderGeminiCliItems,
};

// Kiro (AWS CodeWhisperer) quota functions

interface KiroQuotaData {
  subscriptionTitle: string | null;
  baseQuota: KiroBaseQuota | null;
  freeTrialQuota: KiroFreeTrialQuota | null;
}

const formatKiroResetTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  if (isNaN(date.getTime())) return '-';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
};

const fetchKiroQuota = async (
  file: AuthFileItem,
  t: TFunction
): Promise<KiroQuotaData> => {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    throw new Error(t('kiro_quota.missing_auth_index'));
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'POST',
    url: KIRO_QUOTA_URL,
    header: { ...KIRO_REQUEST_HEADERS },
    data: KIRO_REQUEST_BODY,
  });

  if (result.statusCode < 200 || result.statusCode >= 300) {
    // Try to parse error response for specific error messages
    const errorPayload = parseKiroErrorPayload(result.body ?? result.bodyText);
    if (errorPayload?.reason === 'TEMPORARILY_SUSPENDED') {
      throw createStatusError(t('kiro_quota.suspended'), result.statusCode);
    }
    throw createStatusError(getApiCallErrorMessage(result), result.statusCode);
  }

  const payload = parseKiroQuotaPayload(result.body ?? result.bodyText);
  if (!payload) {
    throw new Error(t('kiro_quota.empty'));
  }

  const subscriptionTitle = normalizeStringValue(payload.subscriptionInfo?.subscriptionTitle);
  const usageBreakdown = payload.usageBreakdownList?.[0];

  let baseQuota: KiroBaseQuota | null = null;
  let freeTrialQuota: KiroFreeTrialQuota | null = null;

  if (usageBreakdown) {
    const limit = normalizeNumberValue(usageBreakdown.usageLimitWithPrecision);
    const used = normalizeNumberValue(usageBreakdown.currentUsageWithPrecision);
    const resetTime = normalizeNumberValue(usageBreakdown.nextDateReset ?? payload.nextDateReset);

    if (limit !== null && used !== null && resetTime !== null) {
      baseQuota = { used, limit, resetTime };
    }

    const freeTrialInfo = usageBreakdown.freeTrialInfo;
    if (freeTrialInfo) {
      const trialLimit = normalizeNumberValue(freeTrialInfo.usageLimitWithPrecision);
      const trialUsed = normalizeNumberValue(freeTrialInfo.currentUsageWithPrecision);
      const trialExpiry = normalizeNumberValue(freeTrialInfo.freeTrialExpiry);
      const trialStatus = normalizeStringValue(freeTrialInfo.freeTrialStatus);

      if (trialLimit !== null && trialUsed !== null && trialExpiry !== null && trialStatus) {
        freeTrialQuota = {
          used: trialUsed,
          limit: trialLimit,
          expiry: trialExpiry,
          status: trialStatus,
        };
      }
    }
  }

  return { subscriptionTitle, baseQuota, freeTrialQuota };
};

const renderKiroItems = (
  quota: KiroQuotaState,
  t: TFunction,
  helpers: QuotaRenderHelpers
): ReactNode => {
  const { styles: styleMap, QuotaProgressBar } = helpers;
  const { createElement: h, Fragment } = React;

  const nodes: ReactNode[] = [];

  // Subscription title
  if (quota.subscriptionTitle) {
    nodes.push(
      h(
        'div',
        { key: 'subscription', className: styleMap.codexPlan },
        h('span', { className: styleMap.codexPlanLabel }, t('kiro_quota.subscription_label')),
        h('span', { className: styleMap.codexPlanValue }, quota.subscriptionTitle)
      )
    );
  }

  // Base quota
  if (quota.baseQuota) {
    const { used, limit, resetTime } = quota.baseQuota;
    const remaining = Math.max(0, limit - used);
    const percent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
    const resetLabel = formatKiroResetTime(resetTime);

    nodes.push(
      h(
        'div',
        { key: 'base', className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h('span', { className: styleMap.quotaModel }, t('kiro_quota.base_quota')),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, `${percent}%`),
            h('span', { className: styleMap.quotaAmount }, `${remaining.toFixed(1)}/${limit}`),
            h('span', { className: styleMap.quotaReset }, resetLabel)
          )
        ),
        h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
      )
    );
  }

  // Free trial quota
  if (quota.freeTrialQuota) {
    const { used, limit, expiry, status } = quota.freeTrialQuota;
    const remaining = Math.max(0, limit - used);
    const percent = limit > 0 ? Math.round((remaining / limit) * 100) : 0;
    const isActive = status.toUpperCase() === 'ACTIVE';
    const statusLabel = isActive ? t('kiro_quota.trial_active') : t('kiro_quota.trial_expired');
    const expiryLabel = formatKiroResetTime(expiry);

    nodes.push(
      h(
        'div',
        { key: 'trial', className: styleMap.quotaRow },
        h(
          'div',
          { className: styleMap.quotaRowHeader },
          h(
            'span',
            { className: styleMap.quotaModel },
            `${t('kiro_quota.free_trial')} (${statusLabel})`
          ),
          h(
            'div',
            { className: styleMap.quotaMeta },
            h('span', { className: styleMap.quotaPercent }, `${percent}%`),
            h('span', { className: styleMap.quotaAmount }, `${remaining.toFixed(1)}/${limit}`),
            h('span', { className: styleMap.quotaReset }, expiryLabel)
          )
        ),
        h(QuotaProgressBar, { percent, highThreshold: 60, mediumThreshold: 20 })
      )
    );
  }

  if (nodes.length === 0) {
    return h('div', { className: styleMap.quotaMessage }, t('kiro_quota.empty'));
  }

  return h(Fragment, null, ...nodes);
};

export const KIRO_CONFIG: QuotaConfig<KiroQuotaState, KiroQuotaData> = {
  type: 'kiro',
  i18nPrefix: 'kiro_quota',
  filterFn: (file) => isKiroFile(file) && !isDisabledAuthFile(file),
  fetchQuota: fetchKiroQuota,
  storeSelector: (state) => state.kiroQuota,
  storeSetter: 'setKiroQuota',
  buildLoadingState: () => ({
    status: 'loading',
    subscriptionTitle: null,
    baseQuota: null,
    freeTrialQuota: null,
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    subscriptionTitle: data.subscriptionTitle,
    baseQuota: data.baseQuota,
    freeTrialQuota: data.freeTrialQuota,
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    subscriptionTitle: null,
    baseQuota: null,
    freeTrialQuota: null,
    error: message,
    errorStatus: status,
  }),
  cardClassName: styles.kiroCard,
  controlsClassName: styles.kiroControls,
  controlClassName: styles.kiroControl,
  gridClassName: styles.kiroGrid,
  renderQuotaItems: renderKiroItems,
};

export const GITHUB_COPILOT_CONFIG: QuotaConfig<
  GithubCopilotQuotaState,
  {
    expiresAt: number | null;
    refreshIn: number | null;
    chatQuota: number | null;
    chatPercent: number | null;
    chatUnlimited: boolean;
    completionsQuota: number | null;
    completionsPercent: number | null;
    completionsUnlimited: boolean;
    premiumQuota: number | null;
    premiumPercent: number | null;
    premiumEntitlement: number | null;
    quotaResetDate: number | null;
    sku: string | null;
  }
> = {
  type: 'github-copilot',
  i18nPrefix: 'github_copilot_quota',
  filterFn: (file) => isGithubCopilotFile(file),
  fetchQuota: fetchGithubCopilotQuota,
  storeSelector: (state) => state.githubCopilotQuota,
  storeSetter: 'setGithubCopilotQuota',
  buildLoadingState: () => ({
    status: 'loading',
    expiresAt: null,
    refreshIn: null,
    chatQuota: null,
    chatPercent: null,
    chatUnlimited: false,
    completionsQuota: null,
    completionsPercent: null,
    completionsUnlimited: false,
    premiumQuota: null,
    premiumPercent: null,
    premiumEntitlement: null,
    quotaResetDate: null,
    sku: null
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    expiresAt: data.expiresAt,
    refreshIn: data.refreshIn,
    chatQuota: data.chatQuota,
    chatPercent: data.chatPercent,
    chatUnlimited: data.chatUnlimited,
    completionsQuota: data.completionsQuota,
    completionsPercent: data.completionsPercent,
    completionsUnlimited: data.completionsUnlimited,
    premiumQuota: data.premiumQuota,
    premiumPercent: data.premiumPercent,
    premiumEntitlement: data.premiumEntitlement,
    quotaResetDate: data.quotaResetDate,
    sku: data.sku
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    expiresAt: null,
    refreshIn: null,
    chatQuota: null,
    chatPercent: null,
    chatUnlimited: false,
    completionsQuota: null,
    completionsPercent: null,
    completionsUnlimited: false,
    premiumQuota: null,
    premiumPercent: null,
    premiumEntitlement: null,
    quotaResetDate: null,
    sku: null,
    error: message,
    errorStatus: status
  }),
  cardClassName: styles.githubCopilotCard,
  controlsClassName: styles.githubCopilotControls,
  controlClassName: styles.githubCopilotControl,
  gridClassName: styles.githubCopilotGrid,
  renderQuotaItems: renderGithubCopilotItems
};

export const GITHUB_COPILOT_CONFIG: QuotaConfig<
  GithubCopilotQuotaState,
  {
    expiresAt: number | null;
    refreshIn: number | null;
    chatQuota: number | null;
    chatPercent: number | null;
    chatUnlimited: boolean;
    completionsQuota: number | null;
    completionsPercent: number | null;
    completionsUnlimited: boolean;
    premiumQuota: number | null;
    premiumPercent: number | null;
    premiumEntitlement: number | null;
    quotaResetDate: number | null;
    sku: string | null;
  }
> = {
  type: 'github-copilot',
  i18nPrefix: 'github_copilot_quota',
  filterFn: (file) => isGithubCopilotFile(file),
  fetchQuota: fetchGithubCopilotQuota,
  storeSelector: (state) => state.githubCopilotQuota,
  storeSetter: 'setGithubCopilotQuota',
  buildLoadingState: () => ({
    status: 'loading',
    expiresAt: null,
    refreshIn: null,
    chatQuota: null,
    chatPercent: null,
    chatUnlimited: false,
    completionsQuota: null,
    completionsPercent: null,
    completionsUnlimited: false,
    premiumQuota: null,
    premiumPercent: null,
    premiumEntitlement: null,
    quotaResetDate: null,
    sku: null
  }),
  buildSuccessState: (data) => ({
    status: 'success',
    expiresAt: data.expiresAt,
    refreshIn: data.refreshIn,
    chatQuota: data.chatQuota,
    chatPercent: data.chatPercent,
    chatUnlimited: data.chatUnlimited,
    completionsQuota: data.completionsQuota,
    completionsPercent: data.completionsPercent,
    completionsUnlimited: data.completionsUnlimited,
    premiumQuota: data.premiumQuota,
    premiumPercent: data.premiumPercent,
    premiumEntitlement: data.premiumEntitlement,
    quotaResetDate: data.quotaResetDate,
    sku: data.sku
  }),
  buildErrorState: (message, status) => ({
    status: 'error',
    expiresAt: null,
    refreshIn: null,
    chatQuota: null,
    chatPercent: null,
    chatUnlimited: false,
    completionsQuota: null,
    completionsPercent: null,
    completionsUnlimited: false,
    premiumQuota: null,
    premiumPercent: null,
    premiumEntitlement: null,
    quotaResetDate: null,
    sku: null,
    error: message,
    errorStatus: status
  }),
  cardClassName: styles.githubCopilotCard,
  controlsClassName: styles.githubCopilotControls,
  controlClassName: styles.githubCopilotControl,
  gridClassName: styles.githubCopilotGrid,
  renderQuotaItems: renderGithubCopilotItems
};
