export interface ModelPricingEntry {
  model: string;
  currency?: string;
  pricingType?: string;
  inputPrice?: number;
  outputPrice?: number;
  reasoningPrice?: number;
  cachedInputPrice?: number;
  requestPrice?: number;
  enabled?: boolean;
}

export interface ModelPricingPatchPayload {
  match?: string;
  index?: number;
  value: Partial<ModelPricingEntry>;
}
