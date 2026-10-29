import { countries } from './countries';
import type { DesignNode, Screen } from './DesignScreen';

export const nodeText = (n: DesignNode): string => n.text || (n.children || []).map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
export const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export type FieldKind = 'text' | 'email' | 'password' | 'confirmPassword' | 'number' | 'url' | 'phone' | 'textarea' | 'checkbox' | 'select' | 'file' | 'search';
export interface FieldSpec {
  id: string; label: string; placeholder: string; kind: FieldKind; required: boolean; options?: string[];
  initial: string | boolean | File[]; disabled?: boolean; min?: number; max?: number; maxBytes?: number; accept?: string; multiple?: boolean;
}
export interface ControlSpec { id: string; label: string; kind: 'button' | 'radio' | 'faq'; context: string; nav: boolean; icon: boolean; sidebar?: boolean; occluded?: boolean; passwordField?: string; rowId?: string; group?: string }
export interface RowSpec { id: string; tableId: string; text: string; cells: string[]; top: number; height: number }
export interface ScreenModel { mutedArtwork: Set<string>; fields: Record<string, FieldSpec>; controls: Record<string, ControlSpec>; rows: RowSpec[]; nodes: Record<string, DesignNode>; texts: string[] }
const CURRENCIES = ['USD', 'NGN', 'EUR', 'GBP', 'CAD', 'GHS', 'KES', 'BTC', 'ETH', 'USDT', 'USDC'];
export function dropdownOptions(label: string): string[] {
  const t = normalize(label);
  if (/expiration|no expiration/.test(t)) return ['No expiration', '7 days', '30 days', '90 days', '1 year'];
  if (/minute|session timeout/.test(t)) return ['1 Minute', '5 Minutes', '15 minutes', '30 minutes', '60 minutes'];
  if (/markup/.test(t)) return ['Standard Tier 1 (0.25%)', 'Standard Tier 2 (0.50%)', 'Custom'];
  if (/fx conversion|auto convert/.test(t)) return ['Auto-convert at EOD', 'Convert on demand', 'Hold original currency'];
  if (/settlement delay|t 2/.test(t)) return ['T+0 (Same Day)', 'T+1 (One Day)', 'T+2 (Two Days)'];
  if (/method.*codes|http method|all methods/.test(t)) return ['All Methods', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  if (/all codes|http status/.test(t)) return ['All Codes', '200', '201', '400', '401', '403', '404', '429', '500'];
  if (/network/.test(t)) return ['Bitcoin', 'Ethereum (ERC-20)', 'Tron (TRC-20)', 'Solana'];
  if (/country|united states|nigeria/.test(t)) return countries;
  if (/business type|select type|llc/.test(t)) return ['Limited Liability Company', 'Sole Proprietorship', 'Partnership', 'Corporation', 'Nonprofit'];
  if (/industry|e commerce/.test(t)) return ['E-commerce', 'Financial Services', 'Technology', 'SaaS', 'Logistics', 'Professional Services', 'Education', 'Other'];
  if (/company size|employees/.test(t)) return ['1-50 employees', '51-200 employees', '201-500 employees', '501-1,000 employees', '1,000+ employees'];
  if (/volume/.test(t)) return ['Under $10,000', '$10,000 – $50,000', '$50,000 – $100,000', '$100,000 – $1,000,000', 'Over $1,000,000'];
  if (/source|funds/.test(t)) return ['Business Revenue', 'Investment', 'Personal Savings', 'Grants', 'Other'];
  if (/role|viewer|admin|operator/.test(t)) return ['Viewer', 'Developer', 'Finance', 'Administrator', 'Support Specialist', 'Compliance Officer'];
  if (/status|active|inactive|pending/.test(t)) return ['All statuses', 'Successful', 'Pending', 'Failed', 'Active', 'Inactive'];
  if (/method/.test(t)) return ['All methods', 'Card', 'Bank Transfer', 'Crypto'];
  if (/date|days|range|period/.test(t)) return ['All dates', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days', 'Custom range'];
  if (/type|action/.test(t)) return ['All types', 'Payment', 'Payout', 'Transfer', 'Exchange', 'Login', 'Configuration'];
  if (/asset|bitcoin|btc|ethereum|eth/.test(t)) return ['Bitcoin (BTC)', 'Ethereum (ETH)', 'Tether (USDT)', 'USD Coin (USDC)', 'Solana (SOL)'];
  if (/language|english/.test(t)) return ['English', 'French', 'Spanish', 'Portuguese'];
  if (/timezone|utc|gmt/.test(t)) return ['UTC', 'Africa/Lagos', 'Europe/London', 'America/New_York'];
  if (/version|v202/.test(t)) return ['v2024-04', 'v2023-05'];
  if (/currency|usd|ngn|eur|gbp|cad|ghs|kes|usdt|usdc/.test(t)) return CURRENCIES;
  if (/document|passport|identity/.test(t)) return ['International Passport', 'National ID', "Driver’s License"];
  return ['All', 'Active', 'Inactive'];
}
function labelFor(n: DesignNode, ancestors: DesignNode[]): string {
  const placeholder = nodeText(n);
  for (const parent of [...ancestors].reverse().slice(0, 5)) {
    const leaves: string[] = [];
    function before(x: DesignNode): boolean {
      if (x.id === n.id) return true;
      if (x.type === 'TEXT' && x.text?.trim()) leaves.push(x.text.trim());
      for (const c of x.children || []) if (before(c)) return true;
      return false;
    }
    before(parent);
    const label = leaves.reverse().find(t => t.length < 90 && !/^[•\s*]+$/.test(t) && t !== placeholder);
    if (label) return label.replace(/\s*\*$/, '').trim();
  }
  return placeholder || n.name.replace(/^Input\s*-?\s*/, '') || 'Option';
}
export function buildScreenModel(root: DesignNode, screen: Screen): ScreenModel {
  const model: ScreenModel = { mutedArtwork: new Set(), fields: {}, controls: {}, rows: [], nodes: {}, texts: [] };
  const editing = /settings|configuration|wallet-details/.test(screen.route);
  function walk(n: DesignNode, ancestors: DesignNode[] = [], suppressed = false) {
    model.nodes[n.id] = n;
    if (n.text) model.texts.push(n.text);
    const text = nodeText(n), label = labelFor(n, ancestors);
    const isFrame = n.type === 'FRAME';
    const parent = ancestors.at(-1);
    const short = Number(n.style.height) < 85;
    const isInput = (isFrame || n.type === 'ROUNDED_RECTANGLE') && /^(Input|Textarea)(\s|$)/.test(n.name) && !/:/.test(n.name);
    const isSelect = isFrame && n.name === 'Options';
    const isFile = isFrame && ((/Upload Flow$|Input - Upload documents/.test(n.name)) || (/drag.*drop|click to browse/i.test(text) && Number(n.style.height) >= 100 && Number(n.style.height) < 350 && !n.children?.some(c => /drag.*drop|click to browse/i.test(nodeText(c)) && Number(c.style.height) >= 100)));
    if (!suppressed && isFrame && n.name === 'Label' && Number(n.style.height) <= 32 && /^(Read|Write|Receive|Enable)/i.test(text.trim())) {
      const box = n.children?.find(child => child.type === 'FRAME' && Number(child.style.width) <= 24 && Number(child.style.height) <= 24);
      if (box) { for (const sibling of n.children || []) if (sibling.id !== box.id && Number(sibling.style.width) <= 24 && Number(sibling.style.height) <= 24) model.mutedArtwork.add(sibling.id); const scope = nodeText(ancestors.at(-2) || parent || n).split(/Read|Write|Receive|Enable/)[0].trim().slice(0, 60); model.fields[box.id] = { id: box.id, label: `${scope} ${text.trim()}`.trim(), kind: 'checkbox', placeholder: '', initial: false, required: false }; }
    }
    const isBrand = isFrame && Number(n.style.width) <= 270 && Number(n.style.height) <= 72 && (normalize(text) === 'flurrypay' || /^(FlurryPay Logo|FlurryPay Business|Logo)$/.test(n.name));
    const isButton = isFrame && (isBrand || /^(Button|Link|Nav Link|CTA Button|Submit Button|Action Button)(\s|$|:)/i.test(n.name) && !/:shadow|:margin|:align/.test(n.name));
    let childSuppressed = suppressed;
    if (!suppressed && (isInput || isSelect || isFile)) {
      let kind: FieldKind = isSelect ? 'select' : isFile ? 'file' : n.name === 'Textarea' ? 'textarea' : 'text';
      let effectiveLabel = label;
      const context = `${label} ${text} ${n.name}`;
      if (!isFile && !isSelect && kind !== 'textarea') {
        if (Number(n.style.width) <= 26 && Number(n.style.height) <= 26) kind = 'checkbox';
        else if (/search/i.test(context)) { kind = 'search'; effectiveLabel = text || label; }
        else if (/confirm.*password|repeat.*password/i.test(context)) kind = 'confirmPassword';
        else if (/password|••|\*\*\*/i.test(context)) kind = 'password';
        else if (/email|@/.test(context.toLowerCase())) kind = 'email';
        else if (/https?:\/\/|website|endpoint.*url/i.test(context)) kind = 'url';
        else if (/phone|telephone/i.test(context)) kind = 'phone';
        else if (/^[-\d,.]+$/.test(text.trim()) || /amount|year|rate|limit|volume.*usd/i.test(label)) kind = 'number';
      }
      if (kind === 'checkbox') {
        for (const sibling of parent?.children || []) if (sibling.id !== n.id && Number(sibling.style.width) <= 30 && Number(sibling.style.height) <= 30 && Number(sibling.style.left) >= Number(n.style.left) && Number(sibling.style.top) >= Number(n.style.top) && Number(sibling.style.left) + Number(sibling.style.width) <= Number(n.style.left) + Number(n.style.width) + 1 && Number(sibling.style.top) + Number(sibling.style.height) <= Number(n.style.top) + Number(n.style.height) + 1) model.mutedArtwork.add(sibling.id);
        const nearby = [...ancestors].reverse().map(nodeText).find(t => t.length > 8 && t.length < 350);
        effectiveLabel = nearby || label || 'Select permission';
      }
      const options = kind === 'select' ? dropdownOptions(`${label} ${text}`) : undefined;
      const optional = /optional|remember me|search/i.test(context) || (kind === 'checkbox' && !/agree|certify|confirm|consent|accurate|terms/i.test(effectiveLabel));
      const initial = kind === 'file' ? [] : kind === 'checkbox' ? false : kind === 'select' ? (/select|choose/i.test(text) ? '' : (options?.includes(text) ? text : '')) : editing && !['search', 'password', 'confirmPassword'].includes(kind) ? text : '';
      model.fields[n.id] = { id: n.id, label: effectiveLabel, placeholder: kind === 'password' || kind === 'confirmPassword' ? 'Enter your password' : text, kind, required: !optional && kind !== 'search', initial, options,
        min: kind === 'number' ? /year/i.test(label) ? 1800 : 0 : undefined,
        max: /year/i.test(label) ? new Date().getFullYear() : kind === 'textarea' ? 500 : undefined,
        accept: kind === 'file' ? '.pdf,.jpg,.jpeg,.png' : undefined, maxBytes: kind === 'file' ? 5 * 1024 * 1024 : undefined, multiple: isFile && /documents|files/i.test(text) };
      childSuppressed = true;
    }
    if (!suppressed && !isSelect && !isInput && !isFile && isButton) {
      const row = [...ancestors].reverse().find(a => /^(Row \d|Row$)/.test(a.name));
      const passwordField = parent?.children?.find(c => model.fields[c.id]?.kind === 'password' || model.fields[c.id]?.kind === 'confirmPassword');
      const nav = ancestors.some(a => a.name === 'Nav' || a.name === 'Aside' || (a.name === 'Header' && Number(a.style.width) >= 900));
      const radioParent = [...ancestors].reverse().find(a => /Document Type Selection|Buy \/ Sell Toggle|Asset Selection|Role Selection/.test(a.name));
      model.controls[n.id] = { id: n.id, label: text || (isBrand ? 'FlurryPay' : '') || n.name.replace(/^Button\s*-?\s*/, '') || 'More options', kind: radioParent ? 'radio' : 'button', group: radioParent?.id, context: parent ? nodeText(parent).slice(0, 1200) : '', nav, sidebar: ancestors.some(a => a.name === 'Aside'), icon: !text && !isBrand, passwordField: passwordField?.id, rowId: row?.id };
      childSuppressed = true;
    }
    if (!suppressed && isFrame && /^Label(\s|-|$)/.test(n.name) && !n.children?.some(c => /^Input/.test(c.name)) && text && Number(n.style.height) >= 32 && ancestors.some(a => /Selection|Radio|Document Type|settlement/i.test(a.name) || /SELECT DOCUMENT TYPE/.test(nodeText(a).slice(0, 100)))) {
      model.controls[n.id] = { id: n.id, label: text, kind: 'radio', group: parent?.id, context: parent ? nodeText(parent) : text, nav: false, icon: false };
    }
    if (isFrame && /^Row(?: \d+)?$/.test(n.name)) {
      const table = [...ancestors].reverse().find(a => /Table/.test(a.name));
      if (table) model.rows.push({ id: n.id, tableId: table.id, text, cells: (n.children || []).map(nodeText).filter(Boolean), top: Number(n.style.top), height: Number(n.style.height) });
    }
    // Source imports also contain styled, unnamed CTA containers and FAQ rows.
    if (!suppressed && !isButton && !isInput && !isSelect && !isFile && isFrame && short && text.length < 100 && n.children?.some(c => c.type === 'TEXT') && (/^(Reset Password|Verify Email|Continue to Payment|Buy Bitcoin|Sell Bitcoin|Submit|Upload Batch|Pay Securely|Confirm Payment|Confirm & Execute)$/i.test(text.trim()) || /FAQ|Question/.test(n.name))) {
      model.controls[n.id] = { id: n.id, label: text, kind: /FAQ|Question/.test(n.name) ? 'faq' : 'button', context: parent ? nodeText(parent) : text, nav: false, icon: false }; childSuppressed = true;
    }
    for (const c of n.children || []) walk(c, [...ancestors, n], childSuppressed);
  }
  walk(root);
  // Confirm-password fields may have only a masked placeholder in the source.
  const passwords = Object.values(model.fields).filter(f => f.kind === 'password' || f.kind === 'confirmPassword');
  if (/reset-password/.test(screen.route) && passwords[1]) { passwords[1].kind = 'confirmPassword'; passwords[1].label = 'Confirm password'; }
  for (const field of Object.values(model.fields)) {
    if (/zip|postal/i.test(field.label)) field.kind = 'text';
    if (field.kind === 'select') {
      const explicit: Record<string, string> = { '312:761': 'Date Range', '312:767': 'Role', '312:773': 'Action Type', '328:1722': 'Transaction Type', '328:1725': 'Status', '332:5267': 'Settlement Currency', '332:5273': 'FX Conversion Policy', '344:8366': 'HTTP Method', '344:8372': 'HTTP Status', '345:9720': 'Settlement Delay', '345:9881': 'Session Timeout' };
      field.label = explicit[field.id] || field.label; field.options = dropdownOptions(field.label + ' ' + field.placeholder);
      if (!/select|choose|any date/i.test(field.placeholder) && !field.options.includes(field.placeholder)) field.options.unshift(field.placeholder);
      field.initial = /select|choose/i.test(field.placeholder) ? '' : field.placeholder;
    }
    if (field.kind === 'file') field.label = /onboarding-step-2/.test(screen.route) ? 'Identity document' : /onboarding-step-3/.test(screen.route) ? 'Business registration documents' : /onboarding-step-4/.test(screen.route) ? 'Proof of address' : 'Supporting document';
    if (field.kind === 'password') field.label = 'Password';
    if (field.kind === 'checkbox' && screen.route === '/register') { field.label = 'I agree to the Terms of Service and Privacy Policy'; field.required = true; }
    if (field.kind === 'checkbox' && screen.route === '/login') { field.label = 'Remember me'; field.required = false; }
    if (field.kind === 'checkbox' && /final-review/.test(screen.route)) { field.required = true; field.label = /2235$/.test(field.id) ? 'I confirm the information is accurate' : 'I agree to the verification terms'; }
  }
  if (/onboarding-step-2/.test(screen.route)) model.fields['selfie'] = { id: 'selfie', label: 'Identity photo', placeholder: '', kind: 'file', required: true, initial: [], accept: '.jpg,.jpeg,.png', maxBytes: 5 * 1024 * 1024 };
  if (/add-new-wallet/.test(screen.route)) for (const control of Object.values(model.controls)) if (/^Button - (USD|EUR|GBP|BTC|CAD|ETH|USDT|SOL|ADA|XRP)/.test(model.nodes[control.id]?.name || '')) { control.kind = 'radio'; control.group = 'wallet-currency'; }
  if (Object.values(model.controls).some(c => /upload batch/i.test(c.label))) model.fields.batch = { id: 'batch', label: 'Batch CSV', placeholder: '', kind: 'file', required: false, initial: [], accept: '.csv', maxBytes: 5 * 1024 * 1024 };
  if (Object.values(model.controls).some(c => /change logo/i.test(c.label))) model.fields.logo = { id: 'logo', label: 'Platform logo', placeholder: '', kind: 'file', required: false, initial: [], accept: '.jpg,.jpeg,.png', maxBytes: 5 * 1024 * 1024 };
  if (/quick-exchange-modal|add-new-wallet/.test(screen.route)) for (const field of Object.values(model.fields)) if (field.kind === 'search' && /transactions|customers/.test(field.placeholder)) field.disabled = true;
  // Some source frames include several superimposed sidebar references.
  // Keep the exact artwork, but do not expose covered duplicate links to focus or pointer input.
  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {};
  function rectangles(n: DesignNode, x = 0, y = 0) {
    const left = x + Number(n.style.left || 0), top = y + Number(n.style.top || 0);
    rects[n.id] = { x: left, y: top, w: Number(n.style.width), h: Number(n.style.height) };
    for (const child of n.children || []) rectangles(child, left, top);
  }
  rectangles(root);
  const foreground: { x: number; y: number; w: number; h: number }[] = [];
  for (const control of Object.values(model.controls).filter(c => c.sidebar).reverse()) {
    const rect = rects[control.id]; if (!rect) continue;
    const x = rect.x + rect.w / 2, y = rect.y + rect.h / 2;
    if (foreground.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)) control.occluded = true;
    else foreground.push(rect);
  }
  return model;
}
