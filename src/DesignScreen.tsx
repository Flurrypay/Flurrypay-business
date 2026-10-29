import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { destination } from './navigation';
import screens from './screens.json';
import { InteractionProvider, InteractiveButton, useRuntime } from './InteractionRuntime';
import FormControl from './FormControls';
import CustomDropdown from './CustomDropdown';
import { contextualDestination } from './navigation';

export interface DesignNode {
  id: string; name: string; type: string; style: CSSProperties;
  text?: string; runs?: { text: string; color?: string }[];
  children?: DesignNode[]; image?: string; imageFit?: 'cover' | 'contain';
  paths?: { d: string; fill: string; rule?: 'evenodd' | 'nonzero' }[];
  anchorRight?: number; overlay?: boolean; clip?: boolean; flow?: string; order?: string[]; gap?: number; padding?: number[];
}
export type Screen = typeof screens[number];

function RichText({ node }: { node: DesignNode }) {
  return node.runs ? node.runs.map((r, i) => <span key={i} style={r.color ? { color: r.color } : undefined}>{r.text}</span>) : node.text;
}

function Layer({ node, category, root = false, navigate, mobileOrder }: { node: DesignNode; category: string; root?: boolean; mobileOrder?: number; navigate: (path: string) => void }) {
  const runtime = useRuntime();
  if (runtime.hiddenRows.has(node.id) || runtime.model.mutedArtwork.has(node.id)) return null;
  const field = runtime.model.fields[node.id];
  const control = runtime.model.controls[node.id];
  const style: CSSProperties & Record<string, unknown> = { ...node.style };
  if (runtime.rowPositions[node.id] !== undefined) style.top = runtime.rowPositions[node.id];
  if (node.type === 'ROUNDED_RECTANGLE' && !field) style.pointerEvents = 'none';
  if (control?.kind === 'radio' && runtime.selections[control.group || 'active-tab']) { const selected = runtime.selections[control.group || 'active-tab'] === control.label; style.backgroundColor = selected ? '#f2f3ff' : '#fff'; style.boxShadow = `inset 0 0 0 ${selected ? 2 : 1}px ${selected ? '#003ec7' : '#c3c5d9'}`; }
  const children = node.children || [];
  if (root) { style.left = 0; style.top = 0; }
  const isText = node.type === 'TEXT';
  const isVector = node.type === 'VECTOR';
  const link = !!control;
  const flow = node.flow || '';
  const classes = ['design-layer', isText ? 'design-text' : '', isText && Number(node.style.fontSize) >= 32 ? 'large-text' : '', isText && /^[+$€£₦\d.,% -]+$/.test(node.text || '') ? 'design-value' : '', root ? 'screen-root' : '', node.overlay ? 'overlay' : '', node.anchorRight !== undefined ? 'anchor-right' : '', node.clip ? 'clip' : '', flow ? `flow-${flow}` : '', flow === 'row' && Number(node.style.width) < 380 ? 'compact-row' : '', node.name === 'Aside' ? 'sidebar' : '', node.name === 'Table' ? 'native-table' : '', node.name === 'Header' && Number(node.style.width) >= 900 ? 'design-header' : '', /Table|Tbody/.test(node.name) ? 'design-table' : '', node.name.startsWith('Heading') ? 'design-heading' : '', link ? 'design-control' : '', node.image ? 'image-layer' : ''].filter(Boolean).join(' ');
  style['--source-left'] = `${node.style.left}px`;
  style['--source-top'] = `${node.style.top}px`;
  style['--anchor-right'] = `${node.anchorRight || 0}px`;
  style['--source-font'] = `${Number(node.style.fontSize) || 14}px`;
  style['--source-width'] = `${node.style.width}px`;
  style['--source-height'] = `${node.style.height}px`;
  style['--source-ratio'] = `${Number(node.style.width) / Number(node.style.height)}`;
  style['--mobile-order'] = mobileOrder ?? 0;
  style['--flow-gap'] = `${Math.min(node.gap || 0, 48)}px`;
  if (node.padding) {
    style['--flow-padding'] = node.padding.map(v => `${Math.min(v, 48)}px`).join(' ');
  }
  const renderChildren = children.map(c => <Layer key={c.id} node={c} category={category} navigate={navigate} mobileOrder={node.order?.indexOf(c.id)} />);
  let content: ReactNode = <>{node.image && <img className="design-image" src={node.image} alt="" loading="lazy" style={{ objectFit: node.imageFit || 'cover' }} />}{renderChildren}</>;
  if (runtime.logoUrl && /logo|flurrypay business/i.test(node.name) && Number(node.style.width) <= 180 && Number(node.style.height) <= 120) content = <img className="design-image" src={runtime.logoUrl} alt="Selected platform logo preview" style={{ objectFit: 'contain' }} />;
  if (node.name === 'Table') content = <div className="table-content">{content}</div>;
  if (flow === 'art' && !isText && !isVector && node.name !== 'Table') content = <div className="art-content">{content}</div>;
  if (isText) content = runtime.textOverride(node) ?? <RichText node={node} />;
  if (isVector) content = <svg className="design-vector" viewBox={`0 0 ${node.style.width} ${node.style.height}`} aria-hidden="true">{node.paths?.map((p, i) => <path key={i} d={p.d} fill={p.fill} fillRule={p.rule} />)}</svg>;
  if (field) content = <FormControl spec={field}>{content}</FormControl>;
  const props = { className: classes, style, 'data-node': node.id, 'data-name': node.name, 'data-flow-order': node.order?.join(','), role: Object.values(runtime.model.controls).some(control => control.kind === 'radio' && control.group === node.id) ? 'radiogroup' as const : undefined };
  if (control && !control.occluded) return <div {...props}><InteractiveButton control={control}>{content}</InteractiveButton></div>;
  const Tag = isText ? 'span' : root ? 'main' : node.name === 'Heading 1' ? 'h1' : node.name === 'Heading 2' ? 'h2' : node.name === 'Heading 3' ? 'h3' : 'div';
  return <Tag {...props}>{content}</Tag>;
}

const screenCache = new Map<string, DesignNode>();

export default function DesignScreen({ screen, navigate }: { screen: Screen; navigate: (path: string) => void }) {
  const [node, setNode] = useState<DesignNode | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setNode(null); setError(false); setMenuOpen(false);
    document.title = `${screen.name} | FlurryPay Business`;
    const cached = screenCache.get(screen.id);
    if (cached) { setNode(cached); return () => controller.abort(); }
    fetch(screen.file, { signal: controller.signal }).then(r => { if (!r.ok) throw new Error('Screen unavailable'); return r.json(); }).then((loaded: DesignNode) => { if (controller.signal.aborted) return; if (screenCache.size >= 12) screenCache.delete(screenCache.keys().next().value!); screenCache.set(screen.id, loaded); setNode(loaded); }).catch(e => { if (e.name !== 'AbortError') setError(true); });
    return () => controller.abort();
  }, [screen, retry]);
  useEffect(() => { if (!menuOpen) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenuOpen(false); document.querySelector<HTMLButtonElement>('.mobile-header button')?.focus(); } }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [menuOpen]);
  const nav = screen.category === 'website' ? ['Products', 'Solutions', 'Pricing', 'Developers', 'Resources', 'Contact', 'Log in', 'Create Account'] : screen.category === 'admin' ? ['Overview', 'Merchants', 'Users', 'Transactions', 'Settings'] : ['Overview', 'Payment Links', 'Transactions', 'Wallets', 'Crypto', 'OTC Desk', 'Team', 'Developers', 'Settings'];
  return <>
    <header className="mobile-header"><a href="/" onClick={e => { e.preventDefault(); navigate('/'); }}>FlurryPay</a><button type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><span /><span /><span /></button></header>
    {menuOpen && <nav className="mobile-navigation" aria-label="Main navigation">{nav.map(label => screen.category === 'website' && ['Products', 'Developers'].includes(label) ? <div className="mobile-menu-item" key={label}><CustomDropdown label={label} items={(label === 'Products' ? ['Multi-currency Accounts', 'Cross-border Payments', 'Global Payouts', 'Merchant Gateway', 'OTC Desk', 'Digital Wallet Services'] : ['Documentation', 'API Reference', 'Get API Keys']).map(value => ({ label: value, value }))} onChange={value => { const route = contextualDestination(value, screen.route, screen.category, true); if (route) { setMenuOpen(false); navigate(route); } }}><span>{label}</span><span aria-hidden="true">⌄</span></CustomDropdown></div> : <a key={label} href={destination(label, screen.category) || '/products/multi-currency-accounts'} onClick={e => { e.preventDefault(); setMenuOpen(false); navigate(destination(label, screen.category) || '/products/multi-currency-accounts'); }}>{label}</a>)}</nav>}
    {error ? <div role="alert" className="screen-error"><p>Unable to load this screen.</p><button className="primary-action" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div> : node && node.id === screen.id ? <InteractionProvider key={screen.id} node={node} screen={screen} navigate={navigate}><div className={`screen-stage category-${screen.category}`} style={{ '--canvas-width': `${screen.width}px` } as CSSProperties}><Layer node={node} category={screen.category} root navigate={navigate} /></div></InteractionProvider> : <div className="screen-loading" role="status" aria-label="Loading screen" />}
  </>;
}
