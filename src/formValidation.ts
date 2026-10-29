import * as Yup from 'yup';
import type { FieldSpec } from './interactionModel';
export type FieldValue = string | boolean | File[];
export type FormValues = Record<string, FieldValue>;
export function createValidationSchema(fields: FieldSpec[], route = '') {
  const password = fields.find(f => f.kind === 'password');
  const shape: Record<string, Yup.AnySchema> = {};
  for (const f of fields) {
    const required = `${f.label} is required.`;
    if (f.kind === 'checkbox') { shape[f.id] = f.required ? Yup.boolean().oneOf([true], 'Please confirm this declaration to continue.').required(required) : Yup.boolean(); continue; }
    if (f.kind === 'file') {
      let schema = Yup.array().max(f.multiple ? 10 : 1, f.multiple ? 'Select no more than 10 files.' : 'Select one file.').of(Yup.mixed<File>().test('file', 'Select a valid PDF, JPG or PNG file within the size limit.', async value => !value || await validateFileContent(value, f) === null));
      if (f.required) schema = schema.min(1, `Please select ${f.label.toLowerCase()}.`);
      shape[f.id] = schema; continue;
    }
    if (f.kind === 'number') {
      let number = Yup.number().transform((_value, original) => original === '' ? undefined : Number(String(original).replace(/,/g, ''))).typeError('Enter a valid number.').test('finite', 'Enter a finite number.', n => n == null || Number.isFinite(n));
      if (f.min !== undefined) number = number.min(f.min, `Minimum value is ${f.min}.`);
      if (f.max !== undefined) number = number.max(f.max, `Maximum value is ${f.max}.`);
      if (/year/i.test(f.label)) number = number.integer('Enter a whole year.');
      else if (/amount|trade|receive|pay|send|0\.00/i.test(f.label + f.placeholder)) number = number.moreThan(0, 'Amount must be greater than zero.');
      shape[f.id] = f.required ? number.required(required) : number; continue;
    }
    let schema = Yup.string().trim().max(f.kind === 'textarea' ? f.max || 500 : 2000, 'This value is too long.');
    if (f.kind === 'email') schema = schema.email('Enter a valid email address.');
    if (f.kind === 'url') schema = schema.url('Enter a valid URL including https://.').matches(/^https?:\/\//i, { message: 'Use an http:// or https:// URL.', excludeEmptyString: true });
    if (/wallet address|btc address|bitcoin address/i.test(f.label + ' ' + f.placeholder)) {
      schema = schema.test('address-format', 'Enter a valid wallet address or supported ENS name.', value => !value || /^0x[a-fA-F0-9]{40}$/.test(value) || /^(bc1|tb1)[a-z0-9]{11,87}$/.test(value) || /^[13mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value) || /ens/i.test(f.placeholder) && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.eth$/i.test(value));
    }
    if (f.kind === 'phone') schema = schema.matches(/^\+?[\d\s().-]{7,25}$/, { message: 'Enter a valid phone number.', excludeEmptyString: true });
    if (f.kind === 'password') {
      schema = schema.max(128, 'Use no more than 128 characters.');
      if (!/log.?in/i.test(route)) schema = schema.min(8, 'Use at least 8 characters.').matches(/[A-Za-z]/, 'Include a letter.').matches(/\d/, 'Include a number.');
    }
    if (f.kind === 'confirmPassword' && password) schema = schema.oneOf([Yup.ref(password.id)], 'Passwords must match.');
    if (f.kind === 'select' && f.options) schema = schema.oneOf(['', ...f.options], 'Choose one of the available options.');
    if (/full name/i.test(f.label)) schema = schema.min(2, 'Enter your full name.');
    shape[f.id] = f.required ? schema.required(required) : schema;
  }
  return Yup.object(shape).test('permissions', 'Choose at least one permission.', function(values) {
    const permissions = fields.filter(field => field.kind === 'checkbox');
    if (/create-new-api-key/.test(route) && permissions.length && !permissions.some(field => (values as Record<string, unknown> | undefined)?.[field.id] === true)) return this.createError({ path: permissions[0].id, message: 'Choose at least one permission.' });
    return true;
  });
}
export function validateFile(file: File, spec: Pick<FieldSpec, 'maxBytes' | 'accept'>): string | null {
  const allowed = (spec.accept || '.pdf,.jpg,.jpeg,.png').split(',').map(s => s.trim().toLowerCase());
  const extension = '.' + (file.name.split('.').pop() || '').toLowerCase();
  const mime = file.type.toLowerCase();
  const supported = allowed.some(type => type.startsWith('.') ? type === extension : type.endsWith('/*') ? mime.startsWith(type.slice(0, -1)) : mime === type);
  if (!supported) return `Unsupported file type. Choose ${allowed.join(', ')}.`;
  if (!file.size) return 'The selected file is empty.';
  if (file.size > (spec.maxBytes || 5 * 1024 * 1024)) return `File must be ${Math.round((spec.maxBytes || 5 * 1024 * 1024) / 1024 / 1024)} MB or smaller.`;
  return null;
}
export function safeDraft(values: FormValues, fields: Record<string, FieldSpec>) {
  return Object.fromEntries(Object.entries(values).filter(([id]) => fields[id] && !['password', 'confirmPassword', 'search'].includes(fields[id].kind)).map(([id, value]) => [fields[id].label, Array.isArray(value) ? value.map(file => ({ name: file.name, size: file.size, type: file.type })) : value]));
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function validateFileContent(file: File, spec: Pick<FieldSpec, 'maxBytes' | 'accept'>): Promise<string | null> {
  const metadataError = validateFile(file, spec); if (metadataError) return metadataError;
  try {
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
    const isPng = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte);
    const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if ((ext === 'pdf' && !isPdf) || (ext === 'png' && !isPng) || ((ext === 'jpg' || ext === 'jpeg') && !isJpeg)) return 'The file contents do not match its extension. Choose a valid PDF, JPG or PNG file.';
    return null;
  } catch { return 'The selected file could not be read. Please choose it again.'; }
}
