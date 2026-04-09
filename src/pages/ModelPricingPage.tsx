import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect, type SearchableOption } from '@/components/ui/SearchableSelect';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { modelPricingApi, modelsApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ModelPricingEntry } from '@/types';
import { formatUsdMinorUnits, parseUsdMinorUnitsInput } from '@/utils/format';
import styles from './BillingManagement.module.scss';

const defaultForm: ModelPricingEntry = {
  model: '',
  currency: 'USD',
  pricingType: 'per_1m_tokens',
  inputPrice: 0,
  outputPrice: 0,
  reasoningPrice: 0,
  cachedInputPrice: 0,
  requestPrice: 0,
  enabled: true,
};

export function ModelPricingPage() {
  const apiBase = useAuthStore((state) => state.apiBase);
  const { showNotification, showConfirmation } = useNotificationStore();
  const [items, setItems] = useState<ModelPricingEntry[]>([]);
  const [catalogModels, setCatalogModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ModelPricingEntry | null>(null);
  const [form, setForm] = useState<ModelPricingEntry>(defaultForm);
  const [inputPriceText, setInputPriceText] = useState('0,00');
  const [outputPriceText, setOutputPriceText] = useState('0,00');
  const [reasoningPriceText, setReasoningPriceText] = useState('0,00');
  const [cachedInputPriceText, setCachedInputPriceText] = useState('0,00');
  const [requestPriceText, setRequestPriceText] = useState('0,00');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pricing, models] = await Promise.all([
        modelPricingApi.list(),
        modelsApi.fetchModels(apiBase || window.location.origin).then((entries) => entries.map((entry) => entry.name)).catch(() => []),
      ]);
      setItems(pricing);
      setCatalogModels(Array.from(new Set(models.filter(Boolean))).sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.model.toLowerCase().includes(term));
  }, [items, query]);

  const modelOptions = useMemo<SearchableOption[]>(
    () => catalogModels.map((model) => ({ value: model, label: model })),
    [catalogModels]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setInputPriceText(formatUsdMinorUnits(defaultForm.inputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setOutputPriceText(formatUsdMinorUnits(defaultForm.outputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setReasoningPriceText(formatUsdMinorUnits(defaultForm.reasoningPrice, { suffix: false, maximumFractionDigits: 4 }));
    setCachedInputPriceText(formatUsdMinorUnits(defaultForm.cachedInputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setRequestPriceText(formatUsdMinorUnits(defaultForm.requestPrice, { suffix: false, maximumFractionDigits: 4 }));
    setModalOpen(true);
  };

  const openEdit = (item: ModelPricingEntry) => {
    setEditing(item);
    setForm({ ...defaultForm, ...item });
    setInputPriceText(formatUsdMinorUnits(item.inputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setOutputPriceText(formatUsdMinorUnits(item.outputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setReasoningPriceText(formatUsdMinorUnits(item.reasoningPrice, { suffix: false, maximumFractionDigits: 4 }));
    setCachedInputPriceText(formatUsdMinorUnits(item.cachedInputPrice, { suffix: false, maximumFractionDigits: 4 }));
    setRequestPriceText(formatUsdMinorUnits(item.requestPrice, { suffix: false, maximumFractionDigits: 4 }));
    setModalOpen(true);
  };

  const submit = async () => {
    if (!form.model.trim()) {
      showNotification('Model is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: ModelPricingEntry = {
        ...form,
        model: form.model.trim(),
        currency: 'USD',
        pricingType: form.pricingType?.trim() || 'per_1m_tokens',
        inputPrice: parseUsdMinorUnitsInput(inputPriceText),
        outputPrice: parseUsdMinorUnitsInput(outputPriceText),
        reasoningPrice: parseUsdMinorUnitsInput(reasoningPriceText),
        cachedInputPrice: parseUsdMinorUnitsInput(cachedInputPriceText),
        requestPrice: parseUsdMinorUnitsInput(requestPriceText),
      };
      if (editing) {
        await modelPricingApi.update({ match: editing.model, value: payload });
        showNotification('Pricing updated', 'success');
      } else {
        await modelPricingApi.create(payload);
        showNotification('Pricing created', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeItem = (item: ModelPricingEntry) => {
    showConfirmation({
      title: 'Delete model pricing',
      message: `Delete pricing for ${item.model}?`,
      variant: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await modelPricingApi.deleteByModel(item.model);
          showNotification('Pricing deleted', 'success');
          await load();
        } catch (err) {
          showNotification(err instanceof Error ? err.message : 'Delete failed', 'error');
        }
      },
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>Model Pricing</h1>
          <div className={styles.subtitle}>Configure per-model billing rates used by backend debiting.</div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>
          <Button onClick={openCreate}>Create Pricing</Button>
        </div>
      </div>

      <Card>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Input placeholder="Search models" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        {!loading && filteredItems.length === 0 ? (
          <EmptyState title="No model pricing" description="Create a pricing entry so usage can be debited correctly." action={<Button onClick={openCreate}>Create Pricing</Button>} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Model</th><th>Input</th><th>Output</th><th>Reasoning</th><th>Cached Input</th><th>Request</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.model}>
                    <td><div className={styles.keyCell}><span className={styles.keyName}>{item.model}</span><span className={styles.muted}>{item.pricingType || 'per_1m_tokens'} · {item.currency || 'USD'}</span></div></td>
                    <td>{formatUsdMinorUnits(item.inputPrice, { maximumFractionDigits: 4 })}</td>
                    <td>{formatUsdMinorUnits(item.outputPrice, { maximumFractionDigits: 4 })}</td>
                    <td>{formatUsdMinorUnits(item.reasoningPrice, { maximumFractionDigits: 4 })}</td>
                    <td>{formatUsdMinorUnits(item.cachedInputPrice, { maximumFractionDigits: 4 })}</td>
                    <td>{formatUsdMinorUnits(item.requestPrice, { maximumFractionDigits: 4 })}</td>
                    <td><span className={`${styles.pill} ${item.enabled === false ? styles.pillDanger : styles.pillSuccess}`}>{item.enabled === false ? 'Disabled' : 'Enabled'}</span></td>
                    <td><div className={styles.rowActions}><Button variant="secondary" size="sm" onClick={() => openEdit(item)}>Edit</Button><Button variant="danger" size="sm" onClick={() => removeItem(item)}>Delete</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Model Pricing' : 'Create Model Pricing'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void submit()} loading={saving}>Save</Button></>}
        width={760}
      >
        <div className={styles.formGrid}>
          <SearchableSelect
            label="Model"
            value={form.model}
            options={modelOptions}
            onChange={(model) => setForm((current) => ({ ...current, model }))}
            placeholder="Select a model"
            hint={catalogModels.length ? 'Choose from the full admin-visible model catalog.' : 'No catalog models loaded yet.'}
          />
          <Input label="Currency" value="USD" disabled />
          <Input label="Pricing Type" value={form.pricingType ?? 'per_1m_tokens'} onChange={(event) => setForm((current) => ({ ...current, pricingType: event.target.value }))} />
          <div className={styles.checkboxRow}><ToggleSwitch checked={form.enabled !== false} onChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} /><span>Enabled</span></div>
          <Input label="Input Price ($/1M)" value={inputPriceText} onChange={(event) => setInputPriceText(event.target.value)} hint="Contoh: 1,00 untuk $1.00 atau 0,75 untuk $0.75 per 1M token" />
          <Input label="Output Price ($/1M)" value={outputPriceText} onChange={(event) => setOutputPriceText(event.target.value)} hint="Contoh: 7,50 untuk $7.50 per 1M token" />
          <Input label="Reasoning Price ($/1M)" value={reasoningPriceText} onChange={(event) => setReasoningPriceText(event.target.value)} />
          <Input label="Cached Input Price ($/1M)" value={cachedInputPriceText} onChange={(event) => setCachedInputPriceText(event.target.value)} />
          <Input label="Request Price ($)" value={requestPriceText} onChange={(event) => setRequestPriceText(event.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
