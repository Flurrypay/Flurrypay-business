import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FormikProvider, useFormik, type FormikProps } from 'formik';
import type { DesignNode, Screen } from './DesignScreen';
import { buildScreenModel, dropdownOptions, normalize, type ControlSpec, type FieldSpec, type ScreenModel } from './interactionModel';
import { createValidationSchema, csvCell, safeDraft, validateFileContent, type FormValues } from './formValidation';
import { contextualDestination } from './navigation';
import screens from './screens.json';
import CustomDropdown from './CustomDropdown';
import PreviewActionForm from './PreviewActionForm';
import { relativeDateWindow, withinDateWindow, type DateWindow } from './dateFilters';

// In-memory drafts only. Passwords, identity documents and form values are never written to browser storage.
interface DraftState { generation: number; fields: Map<string, Record<string, FieldSpec>>; choices: Map<string, Record<string, string>>; forms: Map<string, FormValues>; previewRecords: { type: string; label: string; data: Record<string, unknown> }[]; clear: () => void }
const DraftContext = createContext<DraftState | null>(null);
export function DraftProvider({ children }: { children: ReactNode }) {
  const state = useRef<DraftState>({ generation: 0, fields: new Map(), choices: new Map(), forms: new Map(), previewRecords: [], clear() { this.generation++; this.fields.clear(); this.choices.clear(); this.forms.clear(); this.previewRecords.length = 0; } });
  return <DraftContext.Provider value={state.current}>{children}</DraftContext.Provider>;
}
export function downloadFile(filename: string, content: BlobPart, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select(); const ok = document.execCommand('copy'); field.remove(); if (!ok) throw new Error('Clipboard permission was denied.');
}
interface DialogState { title: string; message?: string; data?: Record<string, unknown>; confirm?: string; onConfirm?: () => void; extra?: ReactNode }
interface RuntimeValue {
  model: ScreenModel; screen: Screen; logoUrl: string; formik: FormikProps<FormValues>; errors: Record<string, string>; passwordVisible: Set<string>;
  togglePassword: (id: string) => void; activate: (control: ControlSpec, value?: string) => void;
  selections: Record<string, string>; setSelection: (key: string, value: string) => void;
  hiddenRows: Set<string>; rowPositions: Record<string, number>; page: number; pages: number;
  showDialog: (dialog: DialogState) => void; notify: (text: string) => void; uploadRequest: (id?: string) => void;
  hrefFor: (control: ControlSpec) => string | undefined; dropdownFor: (control: ControlSpec) => string[] | null;
  navigate: (path: string) => void; textOverride: (node: DesignNode) => string | undefined;
}
const RuntimeContext = createContext<RuntimeValue | null>(null);
export const useRuntime = () => { const runtime = useContext(RuntimeContext); if (!runtime) throw new Error('Interaction provider is missing.'); return runtime; };

function Dialog({ state, close }: { state: DialogState; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]') || [])];
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = overflow; previous?.focus(); };
  }, [close]);
  return createPortal(<div className="interaction-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="interaction-dialog-title" className="interaction-dialog"><button className="dialog-close" aria-label="Close dialog" onClick={close}>×</button><h2 id="interaction-dialog-title">{state.title}</h2>{state.message && <p>{state.message}</p>}{state.data && <dl className="dialog-details">{Object.entries(state.data).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</dd></div>)}</dl>}{state.extra}<div className="dialog-actions"><button className="secondary-action" onClick={close}>Close</button>{state.confirm && <button className="primary-action" onClick={() => { close(); state.onConfirm?.(); }}>{state.confirm}</button>}</div></div></div>, document.body);
}
function slug(text: string) { return normalize(text).replace(/ /g, '-') || 'flurrypay'; }
const findRoute = (pattern: RegExp) => screens.find(s => pattern.test(s.name))?.route;
function actionIsSubmit(control: ControlSpec, _screen: Screen, fields: FieldSpec[]) {
  if (control.nav || !fields.some(f => f.required && f.kind !== 'search')) return false;
  if (/^(continue with|google|github)$|continue with (google|github)/i.test(control.label)) return false;
  if (/^(log in|sign in|create free account|create account|register|reset password|send reset link|send message|subscribe|continue(?: to step \d+)?|submit for verification|generate payment link|generate secure link|create wallet|confirm exchange|send invitation|generate key|add endpoint|update settings|save (?:changes|settings|configuration)|request quote|send bitcoin|buy bitcoin|sell bitcoin|confirm.*|pay now)$/i.test(control.label.trim())) return true;
  return /^(continue|submit|generate|save|update|confirm|send invitation)/i.test(control.label) && !/api docs|documentation|view/i.test(control.label);
}

export function InteractionProvider({ node, screen, navigate, children }: { node: DesignNode; screen: Screen; navigate: (path: string) => void; children: ReactNode }) {
  const drafts = useContext(DraftContext)!;
  const model = useMemo(() => buildScreenModel(node, screen), [node, screen]);
  const fields = Object.values(model.fields);
  drafts.fields.set(screen.route, model.fields);
  const [dialog, setDialog] = useState<DialogState | null>(null); const [notice, setNotice] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(new Set<string>());
  const [selections, setSelections] = useState<Record<string, string>>(() => { const initial: Record<string, string> = {}; for (const control of Object.values(model.controls)) if (control.kind === 'radio' && control.group && !initial[control.group]) initial[control.group] = control.label; return { ...initial, ...drafts.choices.get(screen.route) }; }); const [page, setPage] = useState(1);
  const closeDialog = useCallback(() => setDialog(null), []);
  const closeUpload = useCallback(() => setUploadId(null), []);
  const [uploadId, setUploadId] = useState<string | null>(null); const [hidden, setHidden] = useState(new Set<string>());
  const [dateWindow, setDateWindow] = useState<DateWindow | null>(null);
  const [query, setQuery] = useState(''); const [statusFilter, setStatusFilter] = useState('All statuses'); const [methodFilter, setMethodFilter] = useState('All methods'); const [typeFilter, setTypeFilter] = useState('All types');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const notify = (text: string) => { setNotice(text); clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''), 6500); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const schema = useMemo(() => createValidationSchema(fields, screen.route), [model, screen.route]);
  const initialValues = useMemo(() => ({ ...Object.fromEntries(fields.map(f => [f.id, f.initial])), ...drafts.forms.get(screen.route) }), [model, screen.route, drafts]);
  const formik = useFormik<FormValues>({ initialValues, validationSchema: schema, validateOnBlur: true, validateOnChange: true, onSubmit: async values => {
    const data: Record<string, unknown> = { ...(/final-review/.test(screen.route) ? Object.fromEntries(screens.filter(s => s.name.startsWith('Onboarding') && s.route !== screen.route).map(s => [s.name, safeDraft(drafts.forms.get(s.route) || {}, drafts.fields.get(s.route) || {})])) : {}), ...safeDraft(values, model.fields), ...(Object.keys(selections).length ? { 'Selected options': selections } : {}) };
    const label = screen.name;
    if (/create-new-api-key/.test(screen.route)) data['Demo API key'] = 'demo_' + Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
    drafts.forms.set(screen.route, Object.fromEntries(Object.entries(values).filter(([id]) => !['password', 'confirmPassword'].includes(model.fields[id]?.kind))));
    drafts.previewRecords.push({ type: screen.route, label, data });
    const onboard = screens.filter(s => s.name.startsWith('Onboarding'));
    const index = onboard.findIndex(s => s.route === screen.route);
    if (index >= 0 && index < onboard.length - 1) { navigate(onboard[index + 1].route); return; }
    const next = /register/.test(screen.route) ? onboard[0]?.route : /login/.test(screen.route) ? '/merchant' : /payment-links\/create|create-payment-link-ngn/.test(screen.route) ? findRoute(/^Payment Link Ready/) : /add-new-wallet/.test(screen.route) ? '/merchant/wallets' : /create-new-api-key/.test(screen.route) ? '/merchant/developers' : /invite-team/.test(screen.route) ? findRoute(/^Team Directory/) : undefined;

    setDialog({ title: /onboarding/.test(screen.route) ? 'Verification draft ready' : /login/.test(screen.route) ? 'Login form validated' : /forgot-password/.test(screen.route) ? 'Password reset request ready' : /reset-password/.test(screen.route) ? 'New password validated' : 'Draft validated', message: /onboarding/.test(screen.route) ? 'Your documents and declarations are ready in this browser session. Identity verification has not run; submission requires the verification API.' : 'The form passed validation. This is a local frontend preview; nothing has been sent, authenticated, charged, exchanged or created on a server.', data, confirm: next ? 'Continue preview' : 'Download draft', onConfirm: () => next ? navigate(next) : downloadFile(`${slug(label)}-draft.json`, JSON.stringify(data, null, 2), 'application/json') });
  } });
  const logoFile = Array.isArray(formik.values.logo) ? formik.values.logo[0] : undefined;
  const [logoUrl, setLogoUrl] = useState('');
  useEffect(() => { if (!logoFile) { setLogoUrl(''); return; } const url = URL.createObjectURL(logoFile); setLogoUrl(url); return () => URL.revokeObjectURL(url); }, [logoFile]);
  const generation = useRef(drafts.generation);
  const valuesRef = useRef(formik.values); valuesRef.current = formik.values;
  
  useEffect(() => () => { if (generation.current !== drafts.generation) return; drafts.forms.set(screen.route, Object.fromEntries(Object.entries(valuesRef.current).filter(([id]) => model.fields[id] && !['password', 'confirmPassword'].includes(model.fields[id].kind)))); }, [drafts, screen.route, model]);
  const setSelection = (key: string, value: string) => { setSelections(s => { const next = { ...s, [key]: value }; drafts.choices.set(screen.route, next); return next; }); };
  function togglePassword(id: string) { setPasswordVisible(s => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  const searchValues = fields.filter(f => f.kind === 'search').map(f => String(formik.values[f.id] || '')).filter(Boolean);
  const filterQuery = query || searchValues[0] || '';
  const primaryTableId = model.rows[0]?.tableId;
  const primaryRows = model.rows.filter(row => row.tableId === primaryTableId);
  const selectedStatus = fields.find(f => f.kind === 'select' && /status/i.test(f.label));
  const effectiveStatus = statusFilter !== 'All statuses' ? statusFilter : selectedStatus ? String(formik.values[selectedStatus.id] || 'All statuses') : statusFilter;
  const methodField = fields.find(field => field.kind === 'select' && /method/i.test(field.label));
  const typeField = fields.find(field => field.kind === 'select' && /type|role/i.test(field.label));
  const effectiveMethod = methodFilter !== 'All methods' ? methodFilter : methodField ? String(formik.values[methodField.id] || 'All methods') : methodFilter;
  const effectiveType = typeFilter !== 'All types' ? typeFilter : typeField ? String(formik.values[typeField.id] || 'All types') : typeFilter;
  const filteredRows = primaryRows.filter(row => {
    const text = normalize(row.text);
    return withinDateWindow(row.text, dateWindow) && !hidden.has(row.id) && (!filterQuery || text.includes(normalize(filterQuery))) &&
      (/^(all|any)/i.test(effectiveStatus) || text.includes(normalize(effectiveStatus)) || effectiveStatus === 'Successful' && /success|completed|paid|settled/.test(text)) &&
      (/^(all|any)/i.test(effectiveMethod) || text.includes(normalize(effectiveMethod))) && (/^(all|any)/i.test(effectiveType) || text.includes(normalize(effectiveType)));
  });
  const pageSize = 4; const pages = Math.max(1, Math.ceil(filteredRows.length / pageSize)); const effectivePage = Math.min(page, pages);
  const visibleRows = filteredRows.slice((effectivePage - 1) * pageSize, effectivePage * pageSize);
  const hiddenRows = new Set(primaryRows.filter(r => !visibleRows.includes(r)).map(r => r.id));
  const rowPositions: Record<string, number> = {};
  const tables = [...new Set(model.rows.map(r => r.tableId))];
  tables.forEach(id => { let top = Math.min(...model.rows.filter(r => r.tableId === id).map(r => r.top)); visibleRows.filter(r => r.tableId === id).forEach(row => { rowPositions[row.id] = top; top += row.height; }); });
  useEffect(() => { setPage(1); }, [filterQuery, statusFilter, methodFilter, typeFilter, dateWindow]);
  const errors = Object.fromEntries(Object.entries(formik.errors).filter(([id]) => formik.touched[id] || formik.submitCount > 0).map(([id, error]) => [id, String(error)]));
  function exportRows(rowId?: string) {
    const rows = rowId ? model.rows.filter(r => r.id === rowId) : filteredRows;
    if (!rows.length) { notify('There are no matching rows to export.'); return; }
    const csv = rows.map(row => row.cells.map(csvCell).join(',')).join('\r\n');
    downloadFile(`${slug(screen.name)}.csv`, '\uFEFF' + csv, 'text/csv;charset=utf-8'); notify('CSV downloaded from the displayed sample data.');
  }
  function dropdownFor(control: ControlSpec): string[] | null {
    if (control.passwordField || control.kind !== 'button') return null;
    const t = normalize(control.label);
    if (control.icon && !/close|remove|copy|download|swap|upload/i.test(control.label)) return ['View details', 'Copy reference', 'Export row'];
    if (/^(products|developers|company)$/.test(t) && control.nav && screen.category === 'website') return t === 'products' ? ['Multi-currency Accounts', 'Cross-border Payments', 'Global Payouts', 'Merchant Gateway', 'OTC Desk', 'Digital Wallet Services'] : t === 'developers' ? ['Documentation', 'API Reference', 'Get API Keys'] : ['Contact', 'Resources'];
    if (/^(status|method|date range|last \d+ days|asset|type|action type|role all|all roles|currency|network|usd|eur|gbp|ngn|btc|eth|usdt|usdc)$/.test(t)) return dropdownOptions(control.label);
    if (/network/.test(t) && t.length < 40) return dropdownOptions('Network');
    if (/bitcoin btc|ethereum eth|tether usdt|usd coin usdc/.test(t) && t.length < 40) return dropdownOptions('Asset');
    if (/^filter$/.test(t)) return ['All statuses', 'Successful', 'Pending', 'Failed', 'Active', 'Inactive'];
    return null;
  }
  function hrefFor(control: ControlSpec) {
    if (control.passwordField || actionIsSubmit(control, screen, fields) || dropdownFor(control) || control.kind !== 'button') return undefined;
    const t = normalize(control.label);
    if (control.nav) return contextualDestination(control.label, screen.route, screen.category, true);
    if (/^back to overview$/.test(t)) return '/merchant';
    return contextualDestination(control.label, screen.route, screen.category);
  }
  function draftDialog(title: string, context?: string) {
    if (!fields.some(field => field.required && !['search', 'checkbox'].includes(field.kind))) {
      setDialog({ title, message: context && context.length < 180 ? context : undefined, extra: <PreviewActionForm action={title} onReady={data => { drafts.previewRecords.push({ type: screen.route, label: title, data }); setDialog({ title: 'Preview request ready', message: 'Validated locally. No server action has been performed.', data, confirm: 'Download draft', onConfirm: () => downloadFile(`${slug(title)}-draft.json`, JSON.stringify(data, null, 2), 'application/json') }); }} /> }); return;
    }
    setDialog({ title, message: 'Local preview data. This action requires an API connection before it can affect a live account.', data: { ...(context ? { Details: context } : {}), ...safeDraft(formik.values, model.fields) }, confirm: 'Download draft', onConfirm: () => downloadFile(`${slug(title)}-draft.json`, JSON.stringify(safeDraft(formik.values, model.fields), null, 2), 'application/json') }); }
  async function activate(control: ControlSpec, selected?: string) {
    const label = control.label.trim(); const t = normalize(label); const value = selected || label;
    try {
      if (control.passwordField) { togglePassword(control.passwordField); return; }
      if (control.kind === 'radio') { setSelection(control.group || control.id, label); return; }
      if (control.kind === 'faq') { setDialog({ title: label, message: control.context, confirm: 'Contact support', onConfirm: () => navigate('/contact') }); return; }
      if (selected && control.nav) { const path = contextualDestination(selected, screen.route, screen.category, true); if (path) navigate(path); return; }
      if (selected && /status|filter|method|type|asset|role|days|range/i.test(label)) {
        setSelection(control.id, selected);
        if (/method/i.test(label)) setMethodFilter(selected);
        else if (/type/i.test(label)) setTypeFilter(selected);
        else if (/status|filter/i.test(label)) setStatusFilter(selected);
        else if (/date|days|range/i.test(label)) {
          if (selected === 'Custom range') setDialog({ title: 'Choose date range', extra: <DateRange onApply={(from, to) => { setSelection(control.id, `${from} – ${to}`); setDateWindow({ from, to }); setDialog(null); }} /> });
          else setDateWindow(relativeDateWindow(selected));
        }
        return;
      }
      if (selected && !control.icon) { setSelection(control.id, selected); return; }
      if (actionIsSubmit(control, screen, fields)) {
        const validation = await formik.validateForm();
        if (Object.keys(validation).length) {
          await formik.setTouched(Object.fromEntries([...fields.filter(f => f.required).map(f => [f.id, true] as const), ...Object.keys(validation).map(id => [id, true] as const)]));
          const first = document.getElementById(`field-${Object.keys(validation)[0]}`); first?.scrollIntoView({ block: 'center', behavior: 'smooth' }); first?.focus(); notify('Please correct the highlighted fields before continuing.'); return;
        }
        await formik.submitForm(); return;
      }
      if (/google|github/.test(t) && /login|register/.test(screen.route)) { setDialog({ title: `Continue with ${/google/.test(t) ? 'Google' : 'GitHub'}`, message: 'External sign-in is not connected yet. No authentication has taken place. You can test the email form and preview navigation.' }); return; }
      if (/logout|log out/.test(t)) { setDialog({ title: 'Leave the preview?', message: 'This clears local form drafts and selected documents from this session.', confirm: 'Log out', onConfirm: () => { drafts.clear(); navigate('/login'); } }); return; }
      if (/^(previous step|previous|back|cancel|close)$/.test(t) && !model.rows.length) {
        const onboarding = screens.filter(s => s.name.startsWith('Onboarding')); const i = onboarding.findIndex(s => s.route === screen.route);
        if (i > 0) navigate(onboarding[i - 1].route); else if (history.length > 1) history.back(); else navigate(screen.category === 'website' ? '/' : '/merchant'); return;
      }
      if (/discard changes|^cancel changes$/.test(t)) { setDialog({ title: 'Discard unsaved changes?', confirm: 'Discard changes', onConfirm: () => { formik.resetForm(); notify('Changes discarded.'); } }); return; }
      if (/^(\d+|next|previous)$/.test(t) && model.rows.length) {
        const next = /^\d+$/.test(t) ? Number(t) : effectivePage + (t === 'next' ? 1 : -1);
        if (next < 1 || next > pages) { notify(`The local sample contains ${pages} page${pages === 1 ? '' : 's'}. More records require the API.`); return; } setPage(next); return;
      }
      if (/^(week|month|7d|30d|90d|1y|1m|3m|ytd|sandbox|production|fiat|crypto|node js|python|go|rust|business profile|display preferences|security|notifications|buy|sell|buy crypto|sell crypto)$/.test(t) && !control.nav) {
        if (t === 'crypto' && /add-new-wallet/.test(screen.route)) { const route = findRoute(/^Add New Wallet - Crypto/); if (route) navigate(route); return; }
        if (t === 'fiat' && /add-new-wallet/.test(screen.route)) { const route = findRoute(/^Add New Wallet - Redesigned/); if (route) navigate(route); return; }
        setSelection(control.group || 'active-tab', label); notify(`${label} selected for this preview.`); return;
      }
      if (t === 'edit' && /final-review/.test(screen.route)) { const index = Object.values(model.controls).filter(c => normalize(c.label) === 'edit').findIndex(c => c.id === control.id); const order = [1, 3, 2, 4]; const route = screens.find(s => s.name.startsWith(`Onboarding - Step ${order[index] || 1}:`))?.route; if (route) navigate(route); return; }
      if (/add ip address/i.test(label)) { draftDialog('Add IP Address', control.context); return; }
      if (t === 'edit' && /mfa/i.test(control.context)) { draftDialog('Edit MFA policy', control.context); return; }
      if (/select all/.test(t)) { const permissions = fields.filter(f => f.kind === 'checkbox'); const checked = permissions.every(field => formik.values[field.id] === true); permissions.forEach(f => formik.setFieldValue(f.id, !checked)); return; }
      if (/take selfie|capture|camera/.test(t)) { setUploadId('camera'); return; }
      if (/upload|change logo|choose file|browse|add document/.test(t)) { setUploadId(/logo/i.test(label) ? 'logo' : /batch/i.test(label) && model.fields.batch ? 'batch' : Object.values(model.fields).find(f => f.kind === 'file')?.id || 'extra-upload'); return; }
      if (/remove file/.test(t)) { const f = fields.find(f => f.kind === 'file'); if (f) formik.setFieldValue(f.id, []); notify('Selected files removed.'); return; }
      if (/^search$/.test(t)) {
        const search = searchValues[0]; if (!search?.trim()) { notify('Enter a search term.'); return; }
        if (!model.rows.length) setDialog({ title: `Search: ${search}`, data: { Results: model.texts.filter(text => text.toLowerCase().includes(search.toLowerCase())).join('\n') || 'No matching content found.' } });
        else setQuery(search); return;
      }
      if (/export|download|receipt|report/.test(normalize(value))) {
        if (model.rows.length) exportRows(control.rowId);
        else { downloadFile(`${slug(screen.name)}.txt`, `${screen.name}\n\n${model.texts.join('\n\n')}`); notify('Downloaded the available preview content.'); } return;
      }
      if (/share link|copy link/.test(normalize(value))) { const route = findRoute(/^Checkout - Premium Order Preview/) || screen.route; await copyText(`${location.origin}${route}`); notify('Copied the local checkout preview link.'); return; }
      if (/copy|clipboard|share/.test(normalize(value))) {
        const row = model.rows.find(r => r.id === control.rowId);
        const previewKey = [...drafts.previewRecords].reverse().find(r => r.data['Demo API key'])?.data['Demo API key'];
        const text = row?.text || (/developer|api-key/.test(screen.route) && typeof previewKey === 'string' ? previewKey : undefined) || model.texts.find(s => /https?:\/\/|pk_(test|live)|sk_(test|live)|demo_/.test(s)) || `${location.origin}${screen.route}`;
        await copyText(text); notify('Copied to clipboard.'); return;
      }
      if (/max|use max/.test(t)) { const f = fields.find(f => f.kind === 'number'); if (f) formik.setFieldValue(f.id, '1000'); notify('Sample maximum applied. A live available balance requires the API.'); return; }
      if (/swap/.test(t)) { const amounts = fields.filter(f => f.kind === 'number'); if (amounts.length > 1) { const first = formik.values[amounts[0].id]; formik.setFieldValue(amounts[0].id, formik.values[amounts[1].id]); formik.setFieldValue(amounts[1].id, first); } setSelection('swap', selections.swap === 'yes' ? 'no' : 'yes'); return; }
      if (/delete|revoke|remove|suspend|block|disable|reject/.test(t)) {
        setDialog({ title: label || 'Confirm action', message: 'This changes only the displayed local preview. Live account changes require an authenticated API.', confirm: 'Confirm in preview', onConfirm: () => { if (control.rowId) setHidden(set => new Set(set).add(control.rowId!)); else setSelection(control.id, 'Disabled'); notify('Local preview updated; no server changes were made.'); } }); return;
      }
      if (t === 'done') { navigate('/merchant/payment-links'); return; }
      if (/^back to payment methods$/.test(t) || t === 'pay now') { const route = findRoute(/^Customer Terminal - Select Method/); if (route) navigate(route); return; }
      if (/i ve made the (payment|transfer)/.test(t)) { setDialog({ title: 'Payment confirmation requires the API', message: 'This frontend preview cannot detect or confirm a transfer. No payment status has been changed.' }); return; }
      if (/pay with crypto|option 1 crypto/.test(t)) { const route = findRoute(/^Checkout - Premium Crypto Details/); if (route) navigate(route); return; }
      if (/^bank transfer\b|option 2 bank transfer/.test(t)) { const route = findRoute(/^Customer Terminal - Bank Transfer/); if (route) navigate(route); return; }
      const destination = hrefFor(control);
      if (destination) { if (destination === screen.route) { const heading = Object.values(model.nodes).find(node => node.name === 'Heading 2'); if (heading) document.querySelector(`[data-node="${heading.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); else window.scrollTo({ top: 0, behavior: 'smooth' }); } else navigate(destination); return; }
      if (/privacy|terms|cookies|status|about|career|press|community|twitter|linkedin|github|security protocol/i.test(label)) {
        setDialog({ title: label, message: 'This linked content is not included in the supplied design file. Contact FlurryPay for the published information.', confirm: 'Contact FlurryPay', onConfirm: () => navigate('/contact') }); return;
      }
      if (/@/.test(label) && !/api|key/.test(label.toLowerCase())) { const email = label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]; if (email) { location.href = `mailto:${email}`; return; } }
      if (/\+\d.*\d/.test(label) && /line|phone|800/.test(label)) { location.href = `tel:${label.replace(/[^+\d]/g, '')}`; return; }
      const row = model.rows.find(r => r.id === control.rowId);
      if (/details|view|review|edit|manage|resolve|approve|deposit|withdraw|pay|send|request|buy|sell|create|add|confirm|retry|harvest|rebalance|save|update/.test(normalize(value))) {
        if (row && /details|review|view/.test(normalize(value))) setDialog({ title: 'Record details', data: { Record: row.text }, confirm: 'Export record', onConfirm: () => exportRows(row.id) });
        else draftDialog(label, row?.text || control.context); return;
      }
      // Every remaining source control has an inspectable outcome rather than a no-op.
      setDialog({ title: label || 'More options', data: { Details: control.context || screen.name }, confirm: 'Copy details', onConfirm: () => { copyText(control.context || screen.name).then(() => notify('Copied to clipboard.')).catch(() => notify('Clipboard permission was denied.')); } });
    } catch (error) { notify(error instanceof Error ? error.message : 'The action could not be completed. Please try again.'); }
  }
  function textOverride(n: DesignNode) {
    const text = n.text || '';
    if (/^select all$/i.test(text.trim())) { const boxes = fields.filter(field => field.kind === 'checkbox'); return boxes.length && boxes.every(field => formik.values[field.id] === true) ? 'Clear All' : 'Select All'; }
    if (screen.route === '/register' && /^strong$/i.test(text.trim())) { const password = fields.find(field => field.kind === 'password'); const value = password ? String(formik.values[password.id] || '') : ''; return !value ? '—' : value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) ? 'Strong' : value.length >= 6 ? 'Fair' : 'Weak'; }
    if (/final-review/.test(screen.route)) {
      const businessRoute = screens.find(s => s.name.startsWith('Onboarding - Step 1:'))?.route || '';
      const legalRoute = screens.find(s => s.name.startsWith('Onboarding - Step 3:'))?.route || '';
      const addressRoute = screens.find(s => s.name.startsWith('Onboarding - Step 4:'))?.route || '';
      const business = drafts.forms.get(businessRoute) || {};
      const firstFile = (route: string) => Object.values(drafts.forms.get(route) || {}).find(value => Array.isArray(value) && value.length) as File[] | undefined;
      const review: Record<string, string> = {
        '304:2154': String(business['304:1470'] || 'Not provided'),
        '304:2159': String(business['304:1486'] || 'Not provided'),
        '304:2164': [business['304:1540'], business['304:1548'], business['304:1554'], business['304:1560'], business['304:1566']].filter(Boolean).join(', ') || 'Not provided',
        '304:2181': firstFile(legalRoute)?.map(file => file.name).join(', ') || 'No document selected',
        '304:2197': 'Awaiting identity lookup', '304:2202': 'Awaiting identity lookup', '304:2209': 'Not submitted',
        '304:2226': firstFile(addressRoute)?.map(file => file.name).join(', ') || 'No document selected',
      };
      if (review[n.id]) return review[n.id];
    }
    if (/^Showing \d+.*(?:of|results)/i.test(text)) return `Showing ${visibleRows.length ? (effectivePage - 1) * pageSize + 1 : 0}–${Math.min(effectivePage * pageSize, filteredRows.length)} of ${filteredRows.length} sample records`;
    const previewKey = [...drafts.previewRecords].reverse().find(r => r.data['Demo API key'])?.data['Demo API key'];
    if (typeof previewKey === 'string' && /pk_(test|live)|sk_(test|live)/.test(text)) return previewKey;
    return undefined;
  }
  const runtime: RuntimeValue = { model, screen, logoUrl, formik, errors, passwordVisible, togglePassword, activate, selections, setSelection, hiddenRows, rowPositions, page: effectivePage, pages, showDialog: setDialog, notify, uploadRequest: id => setUploadId(id || 'extra-upload'), hrefFor, dropdownFor, navigate, textOverride };
  return <RuntimeContext.Provider value={runtime}><FormikProvider value={formik}><form className="screen-form" aria-label={screen.name} noValidate onSubmit={event => { event.preventDefault(); const submit = Object.values(model.controls).find(c => actionIsSubmit(c, screen, fields)); if (submit) activate(submit); else notify('Choose an action to continue.'); }}>{children}<button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true">Submit form</button></form>
    {model.rows.length > 0 && !filteredRows.length && <div className="empty-table-message" role="status">No matching records. <button onClick={() => { setQuery(''); fields.filter(f => f.kind === 'search').forEach(f => formik.setFieldValue(f.id, '')); setStatusFilter('All statuses'); setMethodFilter('All methods'); setTypeFilter('All types'); setDateWindow(null); }}>Clear filters</button></div>}
    {Object.keys(errors).length > 0 && <aside className="validation-summary" role="alert"><strong>Please check the form</strong><ul>{Object.entries(errors).map(([id, message]) => <li key={id}><button type="button" onClick={() => { const field = document.getElementById(`field-${id}`); field?.scrollIntoView({ block: 'center', behavior: 'smooth' }); field?.focus(); }}>{model.fields[id]?.label}: {message}</button></li>)}</ul></aside>}
    {notice && createPortal(<div className="interaction-notice" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>, document.body)}
    {dialog && <Dialog state={dialog} close={closeDialog} />}
    {uploadId && <UploadDialog id={uploadId} close={closeUpload} runtime={runtime} />}
  </FormikProvider></RuntimeContext.Provider>;
}
function DateRange({ onApply }: { onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  return <div className="date-range"><label>From<input type="date" value={from} onChange={e => setFrom(e.target.value)} max={to || undefined} /></label><label>To<input type="date" value={to} onChange={e => setTo(e.target.value)} min={from || undefined} /></label><button type="button" className="primary-action" disabled={!from || !to || from > to} onClick={() => onApply(from, to)}>Apply range</button></div>;
}
function UploadDialog({ id, close, runtime }: { id: string; close: () => void; runtime: RuntimeValue }) {
  const [cameraError, setCameraError] = useState(''); const [stream, setStream] = useState<MediaStream | null>(null); const video = useRef<HTMLVideoElement>(null); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);
  useEffect(() => { if (video.current && stream) video.current.srcObject = stream; }, [stream]);
  const spec = runtime.model.fields[id === 'camera' ? 'selfie' : id];
  const apply = (files: File[]) => { if (spec) runtime.formik.setFieldValue(spec.id, files); runtime.notify('File selected locally. It has not been uploaded or verified.'); close(); };
  return <Dialog close={close} state={{ title: id === 'camera' ? 'Capture identity photo' : 'Select a file', message: 'Files remain in memory for this preview. Nothing is sent to a server.', extra: <div className="upload-dialog-body">
    {id === 'camera' && <><video ref={video} autoPlay playsInline muted className="camera-preview" />{cameraError && <p role="alert">{cameraError}</p>}<button type="button" className="secondary-action" onClick={async () => { try { if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Choose an image instead.'); const next = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }); if (!mounted.current) { next.getTracks().forEach(track => track.stop()); return; } setStream(next); } catch { setCameraError('Camera permission was denied or no camera is available. Choose an image instead.'); } }}>Enable camera</button><button type="button" className="primary-action" disabled={!stream} onClick={() => { const v = video.current; if (!v?.videoWidth) return; const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight; canvas.getContext('2d')?.drawImage(v, 0, 0); canvas.toBlob(blob => { if (blob) apply([new File([blob], 'selfie.jpg', { type: 'image/jpeg' })]); }, 'image/jpeg', .9); }}>Capture photo</button></>}
    <label className="dialog-file-label">{id === 'camera' ? 'Or choose a photo' : 'Choose file'}<input type="file" accept={id === 'camera' ? 'image/jpeg,image/png' : spec?.accept || (id === 'logo' ? '.jpg,.jpeg,.png' : '.jpg,.jpeg,.png,.pdf')} multiple={spec?.multiple} onChange={async e => { const files = Array.from(e.target.files || []); if (!files.length) return; const error = (await Promise.all(files.map(f => validateFileContent(f, spec || { accept: id === 'camera' || id === 'logo' ? '.jpg,.jpeg,.png' : '.jpg,.jpeg,.png,.pdf', maxBytes: 5 * 1024 * 1024 })))).find(Boolean); if (error) { setCameraError(error); return; } if (mounted.current) apply(files); }} /></label>{id !== 'camera' && cameraError && <p role="alert">{cameraError}</p>}
  </div> }} />;
}

export function InteractiveButton({ control, children }: { control: ControlSpec; children: ReactNode }) {
  const runtime = useRuntime(); const menu = runtime.dropdownFor(control); const href = runtime.hrefFor(control);
  const selected = runtime.selections[control.id]; const selectedGroup = runtime.selections[control.group || 'active-tab'];
  if (/take selfie/i.test(control.label)) return <button id="field-selfie" type="button" className="interaction-hit-area" aria-label={Array.isArray(runtime.formik.values.selfie) && runtime.formik.values.selfie.length ? 'Retake selfie' : control.label} onClick={() => runtime.activate(control)}>{children}{Array.isArray(runtime.formik.values.selfie) && runtime.formik.values.selfie.length > 0 && <span className="local-file-status">Photo selected locally</span>}</button>;
  if (control.kind === 'radio') return <button type="button" role="radio" className={`interaction-hit-area ${selectedGroup === control.label ? 'is-selected' : ''}`} aria-checked={selectedGroup === control.label} aria-label={control.label} onClick={() => runtime.activate(control)} onKeyDown={e => { if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return; e.preventDefault(); const group = Object.values(runtime.model.controls).filter(c => c.kind === 'radio' && c.group === control.group); const index = group.findIndex(c => c.id === control.id); const next = group[(index + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : group.length - 1)) % group.length]; if (next) { runtime.activate(next); document.querySelector<HTMLElement>(`[data-node="${next.id}"] [role="radio"]`)?.focus(); } }}>{children}</button>;
  if (control.passwordField) return <button type="button" className="interaction-hit-area" aria-label={`${runtime.passwordVisible.has(control.passwordField) ? 'Hide' : 'Show'} password`} aria-pressed={runtime.passwordVisible.has(control.passwordField)} onClick={() => runtime.activate(control)}>{children}</button>;
  if (menu) return <CustomDropdown className="source-menu-trigger" label={control.icon ? `More options${control.rowId ? ' for record' : ''}` : control.label} items={menu.map(label => ({ label, value: label }))} value={selected} onChange={value => runtime.activate(control, value)}>{selected ? <span className="selected-control-label">{selected}</span> : children}</CustomDropdown>;
  if (href) return <a className="interaction-hit-area" href={href} aria-label={control.label} onClick={e => { if (!e.metaKey && !e.ctrlKey && e.button === 0) { e.preventDefault(); if (href === runtime.screen.route && !control.nav) runtime.activate(control); else { if (href === runtime.screen.route) window.scrollTo({ top: 0, behavior: 'smooth' }); runtime.navigate(href); } } }}>{children}</a>;
  return <button type="button" className={`interaction-hit-area ${selectedGroup === control.label ? 'is-selected' : ''}`} aria-label={control.label || 'More options'} aria-pressed={/^(week|month|sandbox|production|fiat|crypto)$/i.test(control.label) ? selectedGroup === control.label : undefined} onClick={() => runtime.activate(control)}>{children}</button>;
}
