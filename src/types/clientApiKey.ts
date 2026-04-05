export interface ClientApiKey {
  key: string;
  name?: string;
  enabled?: boolean;
  allowedModels?: string[];
  creditBalance?: number;
  currency?: string;
  totalTopup?: number;
  totalSpent?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ClientApiKeyPayload {
  key: string;
  name?: string;
  enabled?: boolean;
  allowedModels?: string[];
  currency?: string;
  creditBalance?: number;
  totalTopup?: number;
  totalSpent?: number;
  notes?: string;
}

export interface ClientApiKeyPatchPayload {
  match?: string;
  index?: number;
  value: Partial<ClientApiKeyPayload>;
}

export interface TopupPayload {
  amount: number;
  createdBy?: string;
  description?: string;
}
