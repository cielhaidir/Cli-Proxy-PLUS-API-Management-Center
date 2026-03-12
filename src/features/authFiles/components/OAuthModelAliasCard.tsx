import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModelMappingDiagram, type ModelMappingDiagramRef } from '@/components/modelAlias';
import { IconChevronUp } from '@/components/ui/icons';
import type { OAuthModelAliasEntry } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';
import styles from '@/pages/AuthFilesPage.module.scss';

type UnsupportedError = 'unsupported' | null;
type ViewMode = 'diagram' | 'list' | 'models';

type BulkMappingItem = {
  provider: string;
  sourceModel: string;
};

export type OAuthModelAliasCardProps = {
  disableControls: boolean;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onAdd: () => void;
  onEditProvider: (provider?: string) => void;
  onDeleteProvider: (provider: string) => void;
  modelAliasError: UnsupportedError;
  modelAlias: Record<string, OAuthModelAliasEntry[]>;
  allProviderModels: Record<string, AuthFileModelItem[]>;
  onUpdate: (provider: string, sourceModel: string, newAlias: string) => Promise<void>;
  onBulkUpdate: (items: BulkMappingItem[], newAlias: string) => Promise<void>;
  onDeleteLink: (provider: string, sourceModel: string, alias: string) => void;
  onToggleFork: (
    provider: string,
    sourceModel: string,
    alias: string,
    fork: boolean
  ) => Promise<void>;
  onRenameAlias: (oldAlias: string, newAlias: string) => Promise<void>;
  onDeleteAlias: (aliasName: string) => void;
};

export function OAuthModelAliasCard(props: OAuthModelAliasCardProps) {
  const { t } = useTranslation();
  const diagramRef = useRef<ModelMappingDiagramRef | null>(null);
  const {
    disableControls,
    viewMode,
    onViewModeChange,
    onAdd,
    onEditProvider,
    onDeleteProvider,
    modelAliasError,
    modelAlias,
    allProviderModels,
    onUpdate,
    onBulkUpdate,
    onDeleteLink,
    onToggleFork,
    onRenameAlias,
    onDeleteAlias,
  } = props;

  const [modelSearch, setModelSearch] = useState('');
  const [selectedAlias, setSelectedAlias] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

  const aliasOptions = useMemo(() => {
    const aliases = new Set<string>();
    Object.values(modelAlias).forEach((mappings) => {
      (mappings ?? []).forEach((mapping) => {
        const alias = (mapping.alias ?? '').trim();
        if (alias) aliases.add(alias);
      });
    });
    return Array.from(aliases).sort((a, b) => a.localeCompare(b));
  }, [modelAlias]);

  const aliasMappings = useMemo(() => {
    const aliasKey = selectedAlias.trim().toLowerCase();
    if (!aliasKey) return [];

    return Object.entries(modelAlias)
      .flatMap(([provider, mappings]) =>
        (mappings ?? [])
          .filter((mapping) => (mapping.alias ?? '').trim().toLowerCase() === aliasKey)
          .map((mapping) => ({
            provider,
            sourceModel: (mapping.name ?? '').trim(),
            alias: (mapping.alias ?? '').trim(),
          }))
      )
      .filter((item) => item.sourceModel && item.alias)
      .sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        return a.sourceModel.localeCompare(b.sourceModel);
      });
  }, [modelAlias, selectedAlias]);

  const modelRows = useMemo(() => {
    const aliasMap = new Map<string, Set<string>>();
    Object.entries(modelAlias).forEach(([provider, mappings]) => {
      (mappings ?? []).forEach((mapping) => {
        const sourceModel = (mapping.name ?? '').trim();
        const alias = (mapping.alias ?? '').trim();
        if (!sourceModel || !alias) return;
        const key = `${provider.toLowerCase()}::${sourceModel.toLowerCase()}`;
        if (!aliasMap.has(key)) {
          aliasMap.set(key, new Set());
        }
        aliasMap.get(key)?.add(alias);
      });
    });

    return Object.entries(allProviderModels)
      .flatMap(([provider, models]) =>
        (models ?? []).map((model) => {
          const sourceModel = (model.id ?? '').trim();
          const key = `${provider.toLowerCase()}::${sourceModel.toLowerCase()}`;
          const aliases = Array.from(aliasMap.get(key) ?? []);
          return {
            key,
            provider,
            sourceModel,
            aliases,
          };
        })
      )
      .filter((row) => row.sourceModel)
      .sort((a, b) => {
        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
        return a.sourceModel.localeCompare(b.sourceModel);
      });
  }, [allProviderModels, modelAlias]);

  const filteredModelRows = useMemo(() => {
    const term = modelSearch.trim().toLowerCase();
    if (!term) return modelRows;
    return modelRows.filter((row) => {
      const aliasText = row.aliases.join(' ').toLowerCase();
      return (
        row.provider.toLowerCase().includes(term) ||
        row.sourceModel.toLowerCase().includes(term) ||
        aliasText.includes(term)
      );
    });
  }, [modelRows, modelSearch]);

  const selectedCount = selectedKeys.size;

  const toggleRowSelection = (rowKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredModelRows.forEach((row) => next.add(row.key));
      return next;
    });
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const handleApplyAlias = async () => {
    const alias = selectedAlias.trim();
    if (!alias || selectedKeys.size === 0 || bulkSaving) return;

    const selectedRows = modelRows.filter((row) => selectedKeys.has(row.key));
    if (selectedRows.length === 0) return;

    setBulkSaving(true);
    try {
      await onBulkUpdate(
        selectedRows.map((row) => ({ provider: row.provider, sourceModel: row.sourceModel })),
        alias
      );
    } finally {
      setBulkSaving(false);
    }
  };

  return (
    <Card
      title={t('oauth_model_alias.title')}
      extra={
        <div className={styles.cardExtraButtons}>
          <div className={styles.viewModeSwitch}>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('list')}
              disabled={disableControls || modelAliasError === 'unsupported'}
            >
              {t('oauth_model_alias.view_mode_list')}
            </Button>
            <Button
              variant={viewMode === 'diagram' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('diagram')}
              disabled={disableControls || modelAliasError === 'unsupported'}
            >
              {t('oauth_model_alias.view_mode_diagram')}
            </Button>
            <Button
              variant={viewMode === 'models' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onViewModeChange('models')}
              disabled={disableControls || modelAliasError === 'unsupported'}
            >
              {t('oauth_model_alias.view_mode_models')}
            </Button>
          </div>
          <Button
            size="sm"
            onClick={onAdd}
            disabled={disableControls || modelAliasError === 'unsupported'}
          >
            {t('oauth_model_alias.add')}
          </Button>
        </div>
      }
    >
      {modelAliasError === 'unsupported' ? (
        <EmptyState
          title={t('oauth_model_alias.upgrade_required_title')}
          description={t('oauth_model_alias.upgrade_required_desc')}
        />
      ) : viewMode === 'models' ? (
        modelRows.length === 0 ? (
          <EmptyState title={t('oauth_model_alias.models_empty_all')} />
        ) : (
          <div className={styles.modelBrowserSection}>
            <div className={styles.modelBrowserControls}>
              <input
                className={`input ${styles.modelAliasInput}`}
                value={selectedAlias}
                onChange={(e) => setSelectedAlias(e.target.value)}
                placeholder={t('oauth_model_alias.models_select_or_create_alias')}
                disabled={disableControls || bulkSaving}
                list="oauth-model-alias-options"
              />
              <datalist id="oauth-model-alias-options">
                {aliasOptions.map((alias) => (
                  <option key={alias} value={alias} />
                ))}
              </datalist>
            </div>

            <div className={styles.modelBrowserMeta}>
              {selectedAlias.trim()
                ? t('oauth_model_alias.models_alias_mappings_count', {
                    alias: selectedAlias.trim(),
                    count: aliasMappings.length,
                  })
                : t('oauth_model_alias.models_alias_pick_first')}
            </div>

            {selectedAlias.trim() ? (
              aliasMappings.length === 0 ? (
                <div className={styles.modelBrowserMeta}>
                  {t('oauth_model_alias.models_alias_no_mappings')}
                </div>
              ) : (
                <div className={styles.modelAliasMappings}>
                  {aliasMappings.map((mapping) => (
                    <div
                      key={`${mapping.provider}::${mapping.sourceModel}::${mapping.alias}`}
                      className={styles.modelAliasMappingRow}
                    >
                      <div className={styles.modelAliasMappingInfo}>
                        <span className={styles.modelBrowserName}>{mapping.sourceModel}</span>
                        <span className={styles.modelBrowserProvider}>{mapping.provider}</span>
                      </div>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() =>
                          onDeleteLink(mapping.provider, mapping.sourceModel, mapping.alias)
                        }
                        disabled={disableControls || bulkSaving}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            <div className={styles.modelBrowserControls}>
              <input
                className={`input ${styles.modelSearchInput}`}
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder={t('oauth_model_alias.models_search_placeholder')}
                disabled={disableControls}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={selectAllFiltered}
                disabled={disableControls || filteredModelRows.length === 0}
              >
                {t('oauth_model_alias.models_select_all_filtered')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                disabled={disableControls || selectedCount === 0}
              >
                {t('oauth_model_alias.models_clear_selection')}
              </Button>
              <Button
                size="sm"
                onClick={handleApplyAlias}
                disabled={
                  disableControls ||
                  bulkSaving ||
                  selectedCount === 0 ||
                  selectedAlias.trim().length === 0
                }
                loading={bulkSaving}
              >
                {t('oauth_model_alias.models_apply_alias')}
              </Button>
            </div>

            <div className={styles.modelBrowserMeta}>
              {t('oauth_model_alias.models_selected_count', {
                selected: selectedCount,
                total: filteredModelRows.length,
              })}
            </div>

            <div className={styles.modelBrowserList}>
              {filteredModelRows.map((row) => {
                const isSelected = selectedKeys.has(row.key);
                return (
                  <label key={row.key} className={styles.modelBrowserItem}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(row.key)}
                      disabled={disableControls || bulkSaving}
                    />
                    <div className={styles.modelBrowserInfo}>
                      <div className={styles.modelBrowserName}>{row.sourceModel}</div>
                      <div className={styles.modelBrowserProvider}>{row.provider}</div>
                    </div>
                    <div className={styles.modelBrowserAliases}>
                      {row.aliases.length > 0
                        ? row.aliases.join(', ')
                        : t('oauth_model_alias.models_aliases_none')}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )
      ) : viewMode === 'diagram' ? (
        Object.keys(modelAlias).length === 0 ? (
          <EmptyState title={t('oauth_model_alias.list_empty_all')} />
        ) : (
          <div className={styles.aliasChartSection}>
            <div className={styles.aliasChartHeader}>
              <h4 className={styles.aliasChartTitle}>{t('oauth_model_alias.chart_title')}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => diagramRef.current?.collapseAll()}
                disabled={disableControls || modelAliasError === 'unsupported'}
                title={t('oauth_model_alias.diagram_collapse')}
                aria-label={t('oauth_model_alias.diagram_collapse')}
              >
                <IconChevronUp size={16} />
              </Button>
            </div>
            <ModelMappingDiagram
              ref={diagramRef}
              modelAlias={modelAlias}
              allProviderModels={allProviderModels}
              onUpdate={onUpdate}
              onDeleteLink={onDeleteLink}
              onToggleFork={onToggleFork}
              onRenameAlias={onRenameAlias}
              onDeleteAlias={onDeleteAlias}
              onEditProvider={onEditProvider}
              onDeleteProvider={onDeleteProvider}
              className={styles.aliasChart}
            />
          </div>
        )
      ) : Object.keys(modelAlias).length === 0 ? (
        <EmptyState title={t('oauth_model_alias.list_empty_all')} />
      ) : (
        <div className={styles.excludedList}>
          {Object.entries(modelAlias).map(([provider, mappings]) => (
            <div key={provider} className={styles.excludedItem}>
              <div className={styles.excludedInfo}>
                <div className={styles.excludedProvider}>{provider}</div>
                <div className={styles.excludedModels}>
                  {mappings?.length
                    ? t('oauth_model_alias.model_count', { count: mappings.length })
                    : t('oauth_model_alias.no_models')}
                </div>
              </div>
              <div className={styles.excludedActions}>
                <Button variant="secondary" size="sm" onClick={() => onEditProvider(provider)}>
                  {t('common.edit')}
                </Button>
                <Button variant="danger" size="sm" onClick={() => onDeleteProvider(provider)}>
                  {t('oauth_model_alias.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
