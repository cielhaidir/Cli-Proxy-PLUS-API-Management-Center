import { apiClient } from './client';
import type { BillingOverview, ClientApiKey, ModelPricingEntry } from '@/types';

const normalizeClientApiKey = (input: unknown): ClientApiKey => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    key: String(record.key ?? ''),
    name: typeof record.name === 'string' ? record.name : undefined,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
    allowedModels: Array.isArray(record['allowed-models']) ? record['allowed-models'].map(String) : undefined,
    creditBalance: Number(record['credit-balance'] ?? 0),
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    totalTopup: Number(record['total-topup'] ?? 0),
    totalSpent: Number(record['total-spent'] ?? 0),
    notes: typeof record.notes === 'string' ? record.notes : undefined,
    createdAt: typeof record['created-at'] === 'string' ? String(record['created-at']) : undefined,
    updatedAt: typeof record['updated-at'] === 'string' ? String(record['updated-at']) : undefined,
  };
};

const normalizeModelPricingEntry = (input: unknown): ModelPricingEntry => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    model: String(record.model ?? ''),
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    pricingType: typeof record['pricing-type'] === 'string' ? String(record['pricing-type']) : undefined,
    inputPrice: Number(record['input-price'] ?? 0),
    outputPrice: Number(record['output-price'] ?? 0),
    reasoningPrice: Number(record['reasoning-price'] ?? 0),
    cachedInputPrice: Number(record['cached-input-price'] ?? 0),
    requestPrice: Number(record['request-price'] ?? 0),
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
  };
};

export const billingApi = {
  async getOverview(): Promise<BillingOverview> {
    const data = await apiClient.get<Record<string, unknown>>('/billing/overview');
    const billing = data.billing && typeof data.billing === 'object' ? (data.billing as Record<string, unknown>) : {};
    return {
      currency: typeof billing.currency === 'string' ? billing.currency : undefined,
      totalBalance: Number(billing['total-balance'] ?? 0),
      totalTopup: Number(billing['total-topup'] ?? 0),
      totalSpent: Number(billing['total-spent'] ?? 0),
      ledgerEntries: Number(billing['ledger-entries'] ?? 0),
      clientApiKeys: Array.isArray(billing['client-api-keys']) ? billing['client-api-keys'].map(normalizeClientApiKey) : [],
      modelPricing: Array.isArray(billing['model-pricing']) ? billing['model-pricing'].map(normalizeModelPricingEntry) : [],
    };
  },
};
