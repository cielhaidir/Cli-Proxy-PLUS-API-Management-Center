import { apiClient } from './client';
import type { ModelPricingEntry, ModelPricingPatchPayload } from '@/types';

const normalizeModelPricingEntry = (input: unknown): ModelPricingEntry => {
  const record = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    model: String(record.model ?? ''),
    currency: typeof record.currency === 'string' ? record.currency : undefined,
    pricingType: typeof record['pricing-type'] === 'string' ? String(record['pricing-type']) : typeof record.pricingType === 'string' ? record.pricingType : undefined,
    inputPrice: Number(record['input-price'] ?? record.inputPrice ?? 0),
    outputPrice: Number(record['output-price'] ?? record.outputPrice ?? 0),
    reasoningPrice: Number(record['reasoning-price'] ?? record.reasoningPrice ?? 0),
    cachedInputPrice: Number(record['cached-input-price'] ?? record.cachedInputPrice ?? 0),
    requestPrice: Number(record['request-price'] ?? record.requestPrice ?? 0),
    enabled: typeof record.enabled === 'boolean' ? record.enabled : undefined,
  };
};

const toPayload = (input: Partial<ModelPricingEntry>) => ({
  model: input.model,
  currency: input.currency,
  'pricing-type': input.pricingType,
  'input-price': input.inputPrice,
  'output-price': input.outputPrice,
  'reasoning-price': input.reasoningPrice,
  'cached-input-price': input.cachedInputPrice,
  'request-price': input.requestPrice,
  enabled: input.enabled,
});

export const modelPricingApi = {
  async list(): Promise<ModelPricingEntry[]> {
    const data = await apiClient.get<Record<string, unknown>>('/model-pricing');
    const items = data['model-pricing'];
    return Array.isArray(items) ? items.map(normalizeModelPricingEntry) : [];
  },

  async replace(items: ModelPricingEntry[]): Promise<ModelPricingEntry[]> {
    await apiClient.post('/model-pricing', { items: items.map(toPayload) });
    const data = await apiClient.get<Record<string, unknown>>('/model-pricing');
    const entries = data['model-pricing'];
    return Array.isArray(entries) ? entries.map(normalizeModelPricingEntry) : [];
  },

  async create(item: ModelPricingEntry): Promise<ModelPricingEntry[]> {
    const current = await modelPricingApi.list();
    return modelPricingApi.replace([...current, item]);
  },

  update(payload: ModelPricingPatchPayload) {
    return apiClient.patch('/model-pricing', {
      match: payload.match,
      index: payload.index,
      value: toPayload(payload.value),
    });
  },

  deleteByModel(model: string) {
    return apiClient.delete(`/model-pricing?model=${encodeURIComponent(model)}`);
  },
};
