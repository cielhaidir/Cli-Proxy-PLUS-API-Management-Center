import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SearchableMultiSelect, type SearchableOption } from '@/components/ui/SearchableSelect';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { clientApiKeysApi, modelsApi } from '@/services/api';
import { useAuthStore, useNotificationStore } from '@/stores';
import type { ClientApiKey, ClientApiKeyPayload } from '@/types';
import { formatUsdMinorUnits, parseUsdMinorUnitsInput } from '@/utils/format';
import styles from './BillingManagement.module.scss';

const maskKey = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
};

const defaultForm: ClientApiKeyPayload = {
  key: '',
  name: '',
  enabled: true,
  currency: 'USD',
  allowedModels: [],
  notes: '',
};

export function ClientApiKeysPage() {
  const apiBase = useAuthStore((state) => state.apiBase);
  const { showNotification, showConfirmation } = useNotificationStore();
  const [items, setItems] = useState<ClientApiKey[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [editing, setEditing] = useState<ClientApiKey | null>(null);
  const [topupTarget, setTopupTarget] = useState<ClientApiKey | null>(null);
  const [balanceTarget, setBalanceTarget] = useState<ClientApiKey | null>(null);
  const [form, setForm] = useState<ClientApiKeyPayload>(defaultForm);
  const [topupAmount, setTopupAmount] = useState('0,00');
  const [topupNote, setTopupNote] = useState('');
  const [balanceAmount, setBalanceAmount] = useState('0,00');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [keys, modelList] = await Promise.all([
        clientApiKeysApi.list(),
        modelsApi.fetchModels(apiBase || window.location.origin).then((entries) => entries.map((entry) => entry.name)).catch(() => []),
      ]);
      setItems(keys);
      setAvailableModels(Array.from(new Set(modelList.filter(Boolean))).sort((a, b) => a.localeCompare(b)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load client API keys';
      setError(message);
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
    return items.filter((item) =>
      [item.name, item.key, ...(item.allowedModels ?? [])].some((value) => String(value ?? '').toLowerCase().includes(term))
    );
  }, [items, query]);

  const modelOptions = useMemo<SearchableOption[]>(
    () => availableModels.map((model) => ({ value: model, label: model })),
    [availableModels]
  );

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setModalOpen(true);
  };

  const openEdit = (item: ClientApiKey) => {
    setEditing(item);
    setForm({
      key: item.key,
      name: item.name ?? '',
      enabled: item.enabled ?? true,
      currency: item.currency ?? 'USD',
      allowedModels: [...(item.allowedModels ?? [])],
      notes: item.notes ?? '',
      creditBalance: item.creditBalance,
      totalTopup: item.totalTopup,
      totalSpent: item.totalSpent,
    });
    setModalOpen(true);
  };

  const openTopup = (item: ClientApiKey) => {
    setTopupTarget(item);
    setTopupAmount('0,00');
    setTopupNote('');
    setTopupOpen(true);
  };

  const openBalanceEdit = (item: ClientApiKey) => {
    setBalanceTarget(item);
    setBalanceAmount(formatUsdMinorUnits(item.creditBalance, { suffix: false }));
    setBalanceOpen(true);
  };

  const submitForm = async () => {
    if (!form.key.trim()) {
      showNotification('Client API key is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: ClientApiKeyPayload = {
        ...form,
        key: form.key.trim(),
        name: form.name?.trim(),
        currency: 'USD',
        allowedModels: Array.from(new Set((form.allowedModels ?? []).map((value) => value.trim()).filter(Boolean))),
        notes: form.notes?.trim(),
      };
      if (editing) {
        await clientApiKeysApi.update({ match: editing.key, value: payload });
        showNotification('Client API key updated', 'success');
      } else {
        await clientApiKeysApi.create(payload);
        showNotification('Client API key created', 'success');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitTopup = async () => {
    if (!topupTarget) return;
    let amount = 0;
    try {
      amount = parseUsdMinorUnitsInput(topupAmount);
      if (amount <= 0) {
        throw new Error('Format nominal tidak valid');
      }
    } catch {
      showNotification('Top-up amount must be positive', 'error');
      return;
    }
    setSaving(true);
    try {
      await clientApiKeysApi.topup(topupTarget.key, { amount, description: topupNote.trim(), createdBy: 'frontend-admin' });
      showNotification('Balance updated', 'success');
      setTopupOpen(false);
      await load();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Top-up failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitBalanceEdit = async () => {
    if (!balanceTarget) return;
    let amount = 0;
    try {
      amount = parseUsdMinorUnitsInput(balanceAmount);
      if (amount <= 0) {
        throw new Error('Format nominal tidak valid');
      }
    } catch {
      showNotification('Balance amount is invalid', 'error');
      return;
    }
    setSaving(true);
    try {
      await clientApiKeysApi.update({
        match: balanceTarget.key,
        value: {
          creditBalance: amount,
        },
      });
      showNotification('Balance updated', 'success');
      setBalanceOpen(false);
      await load();
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Balance update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetTotalSpent = (item: ClientApiKey) => {
    showConfirmation({
      title: 'Reset total spent',
      message: `Reset total spent for ${item.name || item.key} to 0?`,
      variant: 'danger',
      confirmText: 'Reset',
      onConfirm: async () => {
        try {
          await clientApiKeysApi.update({
            match: item.key,
            value: {
              totalSpent: 0,
            },
          });
          showNotification('Total spent reset', 'success');
          await load();
        } catch (err) {
          showNotification(err instanceof Error ? err.message : 'Reset failed', 'error');
        }
      },
    });
  };

  const removeItem = (item: ClientApiKey) => {
    showConfirmation({
      title: 'Delete client API key',
      message: `Delete ${item.name || item.key}?`,
      variant: 'danger',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await clientApiKeysApi.deleteByValue(item.key);
          showNotification('Client API key deleted', 'success');
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
          <h1 className={styles.pageTitle}>Client API Keys</h1>
          <div className={styles.subtitle}>Manage client access, model allow-lists, and balances.</div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void load()} disabled={loading || saving}>Refresh</Button>
          <Button onClick={openCreate}>Create Key</Button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}><div className={styles.statLabel}>Keys</div><div className={styles.statValue}>{items.length}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Enabled</div><div className={styles.statValue}>{items.filter((item) => item.enabled !== false).length}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Total Balance</div><div className={styles.statValue}>{formatUsdMinorUnits(items.reduce((sum, item) => sum + (item.creditBalance ?? 0), 0))}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Priced Models</div><div className={styles.statValue}>{availableModels.length}</div></Card>
      </div>

      <Card>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Input placeholder="Search keys or models" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
        {error && <div className="error-box">{error}</div>}
        {!loading && filteredItems.length === 0 ? (
          <EmptyState title="No client API keys" description="Create a managed key to control model access and balances." action={<Button onClick={openCreate}>Create Key</Button>} />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th><th>Key</th><th>Status</th><th>Balance</th><th>Total Topup</th><th>Total Spent</th><th>Allowed Models</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.key}>
                    <td><div className={styles.keyCell}><span className={styles.keyName}>{item.name || 'Unnamed key'}</span><span className={styles.muted}>{item.currency || 'USD'}</span></div></td>
                    <td className={styles.keyValue}>{maskKey(item.key)}</td>
                    <td><span className={`${styles.pill} ${item.enabled === false ? styles.pillDanger : styles.pillSuccess}`}>{item.enabled === false ? 'Disabled' : 'Enabled'}</span></td>
                    <td>{formatUsdMinorUnits(item.creditBalance)}</td>
                    <td>{formatUsdMinorUnits(item.totalTopup)}</td>
                    <td>{formatUsdMinorUnits(item.totalSpent)}</td>
                    <td>{item.allowedModels?.length ?? 0}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <Button variant="secondary" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                        <Button variant="secondary" size="sm" onClick={() => openBalanceEdit(item)}>Edit Balance</Button>
                        <Button variant="secondary" size="sm" onClick={() => openTopup(item)}>Top Up</Button>
                        <Button variant="ghost" size="sm" onClick={() => resetTotalSpent(item)}>Reset Spent</Button>
                        <Link to={`/client-api-keys/${encodeURIComponent(item.key)}`}><Button variant="ghost" size="sm">Detail</Button></Link>
                        <Button variant="danger" size="sm" onClick={() => removeItem(item)}>Delete</Button>
                      </div>
                    </td>
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
        title={editing ? 'Edit Client API Key' : 'Create Client API Key'}
        footer={<><Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void submitForm()} loading={saving}>Save</Button></>}
        width={760}
      >
        <div className={styles.formGrid}>
          <Input label="Key" value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))} />
          <Input label="Name" value={form.name ?? ''} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <div className={styles.checkboxRow}><ToggleSwitch checked={form.enabled !== false} onChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))} /><span>Enabled</span></div>
          <Input label="Currency" value="USD" disabled />
          <div className={styles.fullWidth}>
            <SearchableMultiSelect
              label="Allowed Models"
              value={form.allowedModels ?? []}
              options={modelOptions}
              onChange={(allowedModels) => setForm((current) => ({ ...current, allowedModels }))}
              placeholder="Select allowed models"
              hint={availableModels.length ? 'Leave empty to allow all models for migrated-style behavior.' : 'No catalog models loaded yet.'}
            />
          </div>
          <div className={styles.fullWidth}>
            <div className="form-group">
              <label>Notes</label>
              <textarea className={`input ${styles.textarea}`} value={form.notes ?? ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={topupOpen}
        onClose={() => setTopupOpen(false)}
        title={`Top Up ${topupTarget?.name || topupTarget?.key || ''}`}
        footer={<><Button variant="secondary" onClick={() => setTopupOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void submitTopup()} loading={saving}>Apply</Button></>}
      >
        <Input label="Amount ($)" value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} hint="Contoh: 25,00 untuk top-up $25.00" />
        <Input label="Note" value={topupNote} onChange={(event) => setTopupNote(event.target.value)} />
      </Modal>

      <Modal
        open={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        title={`Edit Balance ${balanceTarget?.name || balanceTarget?.key || ''}`}
        footer={<><Button variant="secondary" onClick={() => setBalanceOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void submitBalanceEdit()} loading={saving}>Save</Button></>}
      >
        <Input label="Balance ($)" value={balanceAmount} onChange={(event) => setBalanceAmount(event.target.value)} hint="Contoh: 100,00 untuk balance $100.00" />
      </Modal>
    </div>
  );
}
