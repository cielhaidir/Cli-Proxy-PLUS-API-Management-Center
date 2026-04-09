import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { clientApiKeysApi } from '@/services/api';
import type { ClientApiKey } from '@/types';
import styles from './BillingManagement.module.scss';

type ActivityRow = {
  id: string;
  kind: string;
  time?: string;
  model?: string;
  amount?: number | null;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  source?: string;
};

type Pagination = {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
};

const PAGE_SIZE = 10;

const centsToDisplay = (value?: number | null) => {
  if (value == null) return '-';
  const amount = Number(value ?? 0) / 100;
  const [whole, decimal] = amount.toFixed(2).split('.');
  const withThousands = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withThousands},${decimal}`;
};

const formatTimestampToGMT8 = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

export function ClientApiKeyDetailPage() {
  const { key = '' } = useParams();
  const decodedKey = decodeURIComponent(key);
  const [clientKey, setClientKey] = useState<ClientApiKey | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    setError('');
    try {
      const [keys, activityData] = await Promise.all([
        clientApiKeysApi.list(),
        clientApiKeysApi.getActivity(decodedKey, nextPage, PAGE_SIZE),
      ]);
      setClientKey(keys.find((item) => item.key === decodedKey) ?? null);
      setActivity(Array.isArray(activityData.items) ? (activityData.items as ActivityRow[]) : []);
      setPagination({
        page: Number(activityData.pagination?.page ?? nextPage),
        page_size: Number(activityData.pagination?.page_size ?? PAGE_SIZE),
        total: Number(activityData.pagination?.total ?? 0),
        total_pages: Number(activityData.pagination?.total_pages ?? 1),
      });
      setPage(Number(activityData.pagination?.page ?? nextPage));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load client API key detail');
    } finally {
      setLoading(false);
    }
  }, [decodedKey, page]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const summary = useMemo(() => {
    if (!clientKey) return [];
    return [
      { label: 'Current Balance', value: centsToDisplay(clientKey.creditBalance) },
      { label: 'Total Topup', value: centsToDisplay(clientKey.totalTopup) },
      { label: 'Total Spent', value: centsToDisplay(clientKey.totalSpent) },
      { label: 'Allowed Models', value: String(clientKey.allowedModels?.length ?? 0) },
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
          <Button variant="secondary" onClick={() => void load(page)} disabled={loading}>Refresh</Button>
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
              <div className={styles.description}>Updated: {clientKey?.updatedAt ? formatTimestampToGMT8(clientKey.updatedAt) : 'N/A'}</div>
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
        </div>

        <div className={styles.detailColumn}>
          <Card title="Activity" subtitle={`${pagination.total} rows`}>
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Usage and billing activity will appear here." />
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Time (GMT+8)</th>
                        <th>Model</th>
                        <th>Amount</th>
                        <th>Input Token</th>
                        <th>Output Token</th>
                        <th>Total Token</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((row) => (
                        <tr key={row.id}>
                          <td>{formatTimestampToGMT8(row.time)}</td>
                          <td>{row.model || '-'}</td>
                          <td>{row.amount == null ? '-' : centsToDisplay(row.amount)}</td>
                          <td>{Number(row.input_tokens ?? 0).toLocaleString('id-ID')}</td>
                          <td>{Number(row.output_tokens ?? 0).toLocaleString('id-ID')}</td>
                          <td>{Number(row.total_tokens ?? 0).toLocaleString('id-ID')}</td>
                          <td>{row.source || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Prev</Button>
                  <span className={styles.muted}>Page {pagination.page} / {pagination.total_pages}</span>
                  <Button variant="secondary" size="sm" onClick={() => setPage((current) => Math.min(pagination.total_pages, current + 1))} disabled={page >= pagination.total_pages}>Next</Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
