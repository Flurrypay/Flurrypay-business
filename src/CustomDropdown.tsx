import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownItem { label: string; value: string; disabled?: boolean }
export default function CustomDropdown({ label, items, value, onChange, children, className = '', invalid = false, searchable = false }: {
  label: string; items: DropdownItem[]; value?: string; onChange: (value: string) => void;
  children?: ReactNode; className?: string; invalid?: boolean; searchable?: boolean;
}) {
  const id = useId(); const trigger = useRef<HTMLButtonElement>(null); const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0, maxHeight: 360 });
  const filtered = items.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));
  const close = () => { setOpen(false); setQuery(''); };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current?.getBoundingClientRect(); if (!r) return;
      const width = Math.min(Math.max(r.width, 230), window.innerWidth - 24);
      const below = window.innerHeight - r.bottom - 16;
      setPosition({ position: 'fixed', width, left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)), ...(below >= 200 ? { top: r.bottom + 6, maxHeight: Math.min(360, below) } : { bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(140, Math.min(360, r.top - 20)) }) });
    };
    place();
    if (!searchable) popup.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => { if (!trigger.current?.contains(e.target as Node) && !popup.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', outside); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => { if (!open) return; const panel = popup.current; const option = panel?.querySelector<HTMLElement>(`[data-option-index="${active}"]`); if (!panel || !option) return; if (option.offsetTop < panel.scrollTop) panel.scrollTop = option.offsetTop; else if (option.offsetTop + option.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = option.offsetTop + option.offsetHeight - panel.clientHeight; }, [active, open]);
  function select(index: number) { const item = filtered[index]; if (item && !item.disabled) { onChange(item.value); close(); trigger.current?.focus(); } }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { close(); trigger.current?.focus(); }
    if (e.key === 'Tab') { close(); trigger.current?.focus({ preventScroll: true }); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!open) { setOpen(true); setActive(Math.max(0, filtered.findIndex(item => item.value === value))); return; } setActive(i => Math.max(0, Math.min(filtered.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))); }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    if (e.key === 'End') { e.preventDefault(); setActive(filtered.length - 1); }
    if (open && (e.key === 'Enter' || e.key === ' ' && !(e.target instanceof HTMLInputElement))) { e.preventDefault(); select(active); }
  };
  return <><button ref={trigger} type="button" className={`custom-dropdown-trigger ${className}`} aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-invalid={invalid || undefined} onKeyDown={keys} onClick={() => { setOpen(!open); setQuery(''); setActive(Math.max(0, items.findIndex(i => i.value === value))); }}>{children || <><span className={!value ? 'control-placeholder' : ''}>{items.find(i => i.value === value)?.label || value || label}</span><span aria-hidden="true">⌄</span></>}</button>
    {open && createPortal(<div ref={popup} className="custom-dropdown-popup" style={position} onKeyDown={keys}>
      {searchable && <input className="dropdown-search" aria-label={`Search ${label}`} role="combobox" aria-expanded={open} aria-controls={id} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} value={query} onChange={e => { setQuery(e.target.value); setActive(0); }} autoFocus />}
      <div id={id} role="listbox" tabIndex={-1} aria-label={label} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined}>{filtered.map((item, index) => <button type="button" role="option" id={`${id}-option-${index}`} aria-selected={value === item.value} aria-disabled={item.disabled || undefined} disabled={item.disabled} data-option-index={index} tabIndex={-1} key={item.value} className={active === index ? 'option-active' : ''} onMouseEnter={() => setActive(index)} onClick={() => select(index)}>{item.label}{value === item.value && <span aria-hidden="true">✓</span>}</button>)}{!filtered.length && <p className="dropdown-empty">No matches found.</p>}</div>
    </div>, document.body)}
  </>;
}
