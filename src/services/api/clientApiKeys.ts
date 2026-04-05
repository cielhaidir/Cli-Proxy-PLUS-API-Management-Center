import { apiClient } from './client';
import type { ClientApiKey, ClientApiKeyPatchPayload, ClientApiKeyPayload, LedgerEntry, TopupPayload } from '@/types';

const normalizeClientApiKey = (input: unknown): ClientApiKey => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    key: String(record.key ?? ''),
    name: typeof record.name === 'string' ? record.name : undefined,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    allowedModels: Array.isArray(record['allowed-models'])
      ? record['allowed-models'].map((value) => String(value))
      : Array.isArray(record.allowedModels)
        ? record.allowedModels.map((value) => String(value))
        : undefined,
    creditBalance: Number(record['credit-balance'] ?? record.creditBalance ?? 0),
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    totalTopup: Number(record['total-topup'] ?? record.totalTopup ?? 0),
    totalSpent: Number(record['total-spent'] ?? record.totalSpent ?? 0),
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    createdAt: typeof record['created-at'] === 'string' ? String(record['created-at']) : typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record['updated-at'] === 'string' ? String(record['updated-at']) : typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  };
};

const normalizeLedgerEntry = (input: unknown): LedgerEntry => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    id: String(record.id ?? ''),
    apiKey: String(record['api-key'] ?? record.apiKey ?? ''),
    type: String(record.type ?? ''),
    amount: Number(record.amount ?? 0),
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    model: typeof record.model === 'string' ? record.model : undefined,
    requestId: typeof record['request-id'] === 'string' ? String(record['request-id']) : typeof record.requestId === 'string' ? record.requestId : undefined,
    inputTokens: Number(record['input-tokens'] ?? record.inputTokens ?? 0),
    outputTokens: Number(record['output-tokens'] ?? record.outputTokens ?? 0),
    reasoningTokens: Number(record['reasoning-tokens'] ?? record.reasoningTokens ?? 0),
    description: typeof record.description === 'string' ? record.description : undefined,
    createdAt: typeof record['created-at'] === 'string' ? String(record['created-at']) : typeof record.createdAt === 'string' ? record.createdAt : undefined,
    createdBy: typeof record['created-by'] === 'string' ? String(record['created-by']) : typeof record.createdBy === 'string' ? record.createdBy : undefined,
  };
};

const toPayload = (input: Partial<ClientApiKeyPayload>) => ({
  key: input.key,
  name: input.name,
  enabled: input.enabled,
  'allowed-models': input.allowedModels,
  currency: input.currency,
  'credit-balance': input.creditBalance,
  'total-topup': input.totalTopup,
  'total-spent': input.totalSpent,
  notes: input.notes,
});

export const clientApiKeysApi = {
  async list(): Promise<ClientApiKey[]> {
    const data = await apiClient.get<Record<string, unknown>>('/client-api-keys');
    const items = data['client-api-keys'];
    return Array.isArray(items) ? items.map(normalizeClientApiKey) : [];
  },

  async replace(items: ClientApiKeyPayload[]): Promise<ClientApiKey[]> {
    await apiClient.post('/client-api-keys', { items: items.map(toPayload) });
    const data = await apiClient.get<Record<string, unknown>>('/client-api-keys');
    const entries = data['client-api-keys'];
    return Array.isArray(entries) ? entries.map(normalizeClientApiKey) : [];
  },

  async create(item: ClientApiKeyPayload): Promise<ClientApiKey[]> {
    const current = await clientApiKeysApi.list();
    return clientApiKeysApi.replace([...current, item]);
  },

  async update(payload: ClientApiKeyPatchPayload): Promise<void> {
    await apiClient.patch('/client-api-keys', {
      match: payload.match,
      index: payload.index,
      value: toPayload(payload.value),
    });
  },

  deleteByValue(value: string) {
    return apiClient.delete(`/client-api-keys?value=${encodeURIComponent(value)}`);
  },

  topup(apiKey: string, payload: TopupPayload) {
    return apiClient.post(`/client-api-keys/${encodeURIComponent(apiKey)}/topups`, {
      amount: payload.amount,
      'created-by': payload.createdBy,
      description: payload.description,
    });
  },

  adjust(apiKey: string, payload: TopupPayload) {
    return apiClient.post(`/client-api-keys/${encodeURIComponent(apiKey)}/adjustments`, {
      amount: payload.amount,
      'created-by': payload.createdBy,
      description: payload.description,
    });
  },

  async getLedger(apiKey: string): Promise<LedgerEntry[]> {
    const data = await apiClient.get<Record<string, unknown>>(`/client-api-keys/${encodeURIComponent(apiKey)}/ledger`);
    const items = data.ledger;
    return Array.isArray(items) ? items.map(normalizeLedgerEntry) : [];
  },

  getUsage(apiKey: string) {
    return apiClient.get<Record<string, unknown>>(`/client-api-keys/${encodeURIComponent(apiKey)}/usage`);
  },
};
