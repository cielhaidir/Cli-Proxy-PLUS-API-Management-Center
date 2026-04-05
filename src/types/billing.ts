import type { ClientApiKey } from './clientApiKey';
import type { ModelPricingEntry } from './modelPricing';

export interface LedgerEntry {
  id: string;
  apiKey: string;
  type: string;
  amount: number;
  currency?: string;
  model?: string;
  requestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  description?: string;
  createdAt?: string;
  createdBy?: string;
}

export interface BillingOverview {
  currency?: string;
  totalBalance?: number;
  totalTopup?: number;
  totalSpent?: number;
  ledgerEntries?: number;
  clientApiKeys?: ClientApiKey[];
  modelPricing?: ModelPricingEntry[];
}
