import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { billingApi } from '@/services/api';
import type { BillingOverview } from '@/types';
import styles from './BillingManagement.module.scss';

const centsToDisplay = (value?: number | null) => {
  if (value == null) return '-';
  const amount = Number(value ?? 0) / 100;
  const [whole, decimal] = amount.toFixed(2).split('.');
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withThousands},${decimal}`;
};

export function BillingOverviewPage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await billingApi.getOverview());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lowBalanceKeys = useMemo(
    () => (overview?.clientApiKeys ?? []).filter((item) => (item.creditBalance ?? 0) > 0 && (item.creditBalance ?? 0) <= 1000),
    [overview]
  );
  const negativeBalanceKeys = useMemo(
    () => (overview?.clientApiKeys ?? []).filter((item) => (item.creditBalance ?? 0) < 0),
    [overview]
  );
  const topSpendKeys = useMemo(
    () => [...(overview?.clientApiKeys ?? [])].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 5),
    [overview]
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.pageTitle}>Billing Overview</h1>
          <div className={styles.subtitle}>See balances, spend, top-ups, and keys that need attention.</div>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}><div className={styles.statLabel}>Total Balance (USD)</div><div className={styles.statValue}>{centsToDisplay(overview?.totalBalance)}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Total Topup (USD)</div><div className={styles.statValue}>{centsToDisplay(overview?.totalTopup)}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Total Spent (USD)</div><div className={styles.statValue}>{centsToDisplay(overview?.totalSpent)}</div></Card>
        <Card className={styles.statCard}><div className={styles.statLabel}>Ledger Entries</div><div className={styles.statValue}>{overview?.ledgerEntries ?? 0}</div></Card>
      </div>

      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <Card title="Low Balance Keys" subtitle="Balance at or below 1000">
            {lowBalanceKeys.length === 0 ? (
              <EmptyState title="No low balance keys" description="All active keys are above the warning threshold." />
            ) : (
              <div className={styles.listStack}>
                {lowBalanceKeys.map((item) => (
                  <div key={item.key} className={styles.keyCell}>
                    <Link to={`/client-api-keys/${encodeURIComponent(item.key)}`} className={styles.keyName}>{item.name || item.key}</Link>
                    <span className={styles.muted}>Balance: {centsToDisplay(item.creditBalance)} USD</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Negative Balance Keys">
            {negativeBalanceKeys.length === 0 ? (
              <EmptyState title="No negative balances" description="No client keys are below zero." />
            ) : (
              <div className={styles.listStack}>
                {negativeBalanceKeys.map((item) => (
                  <div key={item.key} className={styles.keyCell}>
                    <Link to={`/client-api-keys/${encodeURIComponent(item.key)}`} className={styles.keyName}>{item.name || item.key}</Link>
                    <span className={styles.muted}>Balance: {centsToDisplay(item.creditBalance)} USD</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className={styles.detailColumn}>
          <Card title="Highest Spend Keys">
            {topSpendKeys.length === 0 ? (
              <EmptyState title="No spend data" description="Spend summaries will appear after usage debits are recorded." />
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr><th>Key</th><th>Spent (USD)</th><th>Balance (USD)</th><th>Models</th></tr>
                  </thead>
                  <tbody>
                    {topSpendKeys.map((item) => (
                      <tr key={item.key}>
                        <td><Link to={`/client-api-keys/${encodeURIComponent(item.key)}`}>{item.name || item.key}</Link></td>
                        <td>{centsToDisplay(item.totalSpent)}</td>
                        <td>{centsToDisplay(item.creditBalance)}</td>
                        <td>{item.allowedModels?.length ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Pricing Coverage">
            <div className={styles.description}>Configured priced models: {overview?.modelPricing?.length ?? 0}</div>
            <div className={styles.modelList}>
              {(overview?.modelPricing ?? []).slice(0, 24).map((item) => (
                <span key={item.model} className={styles.modelTag}>{item.model}</span>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
