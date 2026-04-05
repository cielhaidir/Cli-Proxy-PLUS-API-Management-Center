import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconX } from './icons';
import styles from './SearchableSelect.module.scss';

export interface SearchableOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  label?: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

interface SearchableMultiSelectProps {
  label?: string;
  value: string[];
  options: SearchableOption[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

const normalize = (value: string) => value.trim().toLowerCase();

function useDropdown(open: boolean, setOpen: (open: boolean) => void) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, setOpen]);

  return ref;
}

function filterOptions(options: SearchableOption[], query: string) {
  const term = normalize(query);
  if (!term) return options;
  return options.filter((option) => {
    const haystacks = [option.value, option.label, option.description ?? ''];
    return haystacks.some((value) => normalize(value).includes(term));
  });
}

export function SearchableSelect({ label, value, options, onChange, placeholder, hint, error, disabled = false }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useDropdown(open, setOpen);

  const mergedOptions = useMemo(() => {
    if (!value || options.some((option) => option.value === value)) {
      return options;
    }
    return [{ value, label: value, description: 'Saved value not present in current catalog' }, ...options];
  }, [options, value]);

  const filtered = useMemo(() => filterOptions(mergedOptions, query), [mergedOptions, query]);
  const selected = mergedOptions.find((option) => option.value === value);

  return (
    <div className="form-group" ref={ref}>
      {label && <label>{label}</label>}
      <div className={styles.root}>
        <button type="button" className={styles.trigger} onClick={() => !disabled && setOpen((prev) => !prev)} disabled={disabled}>
          <span className={`${styles.triggerValue} ${selected ? '' : styles.placeholder}`}>{selected?.label ?? placeholder ?? 'Select'}</span>
          <span className={styles.icon}><IconChevronDown size={16} /></span>
        </button>
        {open && !disabled && (
          <div className={styles.dropdown}>
            <input className={`input ${styles.searchInput}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" autoFocus />
            <div className={styles.options}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>No matching models</div>
              ) : (
                filtered.map((option) => {
                  const active = option.value === value;
                  return (
                    <button key={option.value} type="button" className={`${styles.option} ${active ? styles.optionActive : ''}`} onClick={() => { onChange(option.value); setOpen(false); setQuery(''); }}>
                      <span className={styles.optionMeta}>
                        <span className={styles.optionLabel}>{option.label}</span>
                        {option.description && <span className={styles.optionDescription}>{option.description}</span>}
                      </span>
                      {active && <IconCheck size={16} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}

export function SearchableMultiSelect({ label, value, options, onChange, placeholder, hint, error, disabled = false }: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useDropdown(open, setOpen);

  const mergedOptions = useMemo(() => {
    const existingValues = new Set(options.map((option) => option.value));
    const missingSelected = value
      .filter((selectedValue) => !existingValues.has(selectedValue))
      .map((selectedValue) => ({
        value: selectedValue,
        label: selectedValue,
        description: 'Saved value not present in current catalog',
      }));
    return [...missingSelected, ...options];
  }, [options, value]);

  const filtered = useMemo(() => filterOptions(mergedOptions, query), [mergedOptions, query]);
  const valueSet = useMemo(() => new Set(value), [value]);
  const selected = mergedOptions.filter((option) => valueSet.has(option.value));

  const toggleValue = (nextValue: string) => {
    const next = valueSet.has(nextValue) ? value.filter((item) => item !== nextValue) : [...value, nextValue];
    onChange(next);
  };

  return (
    <div className="form-group" ref={ref}>
      {label && <label>{label}</label>}
      <div className={styles.root}>
        <button type="button" className={styles.trigger} onClick={() => !disabled && setOpen((prev) => !prev)} disabled={disabled}>
          <span className={`${styles.triggerValue} ${selected.length ? '' : styles.placeholder}`}>
            {selected.length ? `${selected.length} model${selected.length === 1 ? '' : 's'} selected` : placeholder ?? 'Select models'}
          </span>
          <span className={styles.icon}><IconChevronDown size={16} /></span>
        </button>
        {selected.length > 0 && (
          <div className={styles.chips} style={{ marginTop: 8 }}>
            {selected.map((option) => (
              <span className={styles.chip} key={option.value}>
                {option.label}
                <button type="button" className={styles.chipRemove} onClick={() => toggleValue(option.value)} aria-label={`Remove ${option.label}`}>
                  <IconX size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        {open && !disabled && (
          <div className={styles.dropdown}>
            <input className={`input ${styles.searchInput}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models" autoFocus />
            <div className={styles.options}>
              {filtered.length === 0 ? (
                <div className={styles.empty}>No matching models</div>
              ) : (
                filtered.map((option) => {
                  const active = valueSet.has(option.value);
                  return (
                    <button key={option.value} type="button" className={`${styles.option} ${active ? styles.optionActive : ''}`} onClick={() => toggleValue(option.value)}>
                      <span className={styles.optionMeta}>
                        <span className={styles.optionLabel}>{option.label}</span>
                        {option.description && <span className={styles.optionDescription}>{option.description}</span>}
                      </span>
                      {active && <IconCheck size={16} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
      {hint && <div className="hint">{hint}</div>}
      {error && <div className="error-box">{error}</div>}
    </div>
  );
}
