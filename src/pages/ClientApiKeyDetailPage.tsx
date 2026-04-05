import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { clientApiKeysApi } from '@/services/api';
import type { ClientApiKey, LedgerEntry } from '@/types';
import styles from './BillingManagement.module.scss';

export function ClientApiKeyDetailPage() {
  const { key = '' } = useParams();
  const decodedKey = decodeURIComponent(key);
  const [clientKey, setClientKey] = useState<ClientApiKey | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [keys, ledgerData, usageData] = await Promise.all([
        clientApiKeysApi.list(),
        clientApiKeysApi.getLedger(decodedKey),
        clientApiKeysApi.getUsage(decodedKey),
      ]);
      setClientKey(keys.find((item) => item.key === decodedKey) ?? null);
      setLedger(ledgerData);
      setUsage((usageData.usage as Record<string, unknown> | null) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client API key detail');
    } finally {
      setLoading(false);
    }
  }, [decodedKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!clientKey) return [];
    return [
      { label: 'Current Balance', value: clientKey.creditBalance ?? 0 },
      { label: 'Total Topup', value: clientKey.totalTopup ?? 0 },
      { label: 'Total Spent', value: clientKey.totalSpent ?? 0 },
      { label: 'Allowed Models', value: clientKey.allowedModels?.length ?? 0 },
    ];
  }, [clientKey]);

  if (!loading && !clientKey) {
    return (
      <div className={styles.container}>
        <EmptyState title="Client API key not found" description="The selected key no longer exists." action={<Link to="/client-api-keys"><Button>Back to Keys</Button></Link>} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>{clientKey?.name || decodedKey}</h1>
          <div className={styles.subtitle}>{decodedKey}</div>
        </div>
        <div className={styles.actions}>
          <Link to="/client-api-keys"><Button variant="secondary">Back</Button></Link>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className={styles.statsGrid}>
        {summary.map((item) => (
          <Card key={item.label} className={styles.statCard}>
            <div className={styles.statLabel}>{item.label}</div>
            <div className={styles.statValue}>{item.value}</div>
          </Card>
        ))}
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <Card title="Summary">
            <div className={styles.listStack}>
              <div className={styles.description}>Enabled: {clientKey?.enabled === false ? 'No' : 'Yes'}</div>
              <div className={styles.description}>Currency: {clientKey?.currency || 'USD'}</div>
              <div className={styles.description}>Updated: {clientKey?.updatedAt || 'N/A'}</div>
              <div className={styles.description}>{clientKey?.notes || 'No notes'}</div>
            </div>
          </Card>
          <Card title="Allowed Models">
            {clientKey?.allowedModels?.length ? (
              <div className={styles.modelList}>
                {clientKey.allowedModels.map((model) => <span className={styles.modelTag} key={model}>{model}</span>)}
              </div>
            ) : (
              <div className={styles.description}>No explicit model restrictions configured.</div>
            )}
          </Card>
          <Card title="Usage Snapshot">
            {usage ? <pre className={styles.description}>{JSON.stringify(usage, null, 2)}</pre> : <div className={styles.description}>No usage snapshot available.</div>}
          </Card>
        </div>

        <div className={styles.detailColumn}>
          <Card title="Ledger" subtitle={`${ledger.length} entries`}>
            {ledger.length === 0 ? (
              <EmptyState title="No ledger entries" description="Top-ups, adjustments, and debits will appear here." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Time</th><th>Type</th><th>Amount</th><th>Model</th><th>Request ID</th><th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.createdAt || '-'}</td>
                        <td>{entry.type}</td>
                        <td>{entry.amount}</td>
                        <td>{entry.model || '-'}</td>
                        <td className={styles.keyValue}>{entry.requestId || '-'}</td>
                        <td>{entry.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
