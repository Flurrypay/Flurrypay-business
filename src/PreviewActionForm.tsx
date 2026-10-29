import { useMemo } from 'react';
import { useFormik } from 'formik';
import CustomDropdown from './CustomDropdown';
import { createValidationSchema, safeDraft, validateFileContent, type FormValues } from './formValidation';
import type { FieldSpec } from './interactionModel';

export function previewFields(action: string): FieldSpec[] {
  const base = (id: string, label: string, kind: FieldSpec['kind'], options?: string[]): FieldSpec => ({ id, label, kind, options, placeholder: '', initial: kind === 'file' ? [] : kind === 'select' ? options?.[0] || '' : '', required: true });
  if (/batch/i.test(action)) return [{ ...base('batch', 'Batch CSV file', 'file'), accept: '.csv', maxBytes: 5 * 1024 * 1024 }];
  if (/ip address/i.test(action)) return [base('ip', 'IP address or CIDR range', 'text'), { ...base('description', 'Description', 'text'), required: false }];
  if (/deposit|withdraw|send|buy|sell|rebalance|payout|exchange|convert/i.test(action)) return [
    { ...base('amount', 'Amount', 'number'), min: 0 }, base('currency', 'Currency', 'select', ['USD', 'NGN', 'EUR', 'GBP', 'BTC', 'ETH', 'USDC', 'USDT']),
    ...( /withdraw|send|payout/i.test(action) ? [base('destination', 'Destination account or wallet', 'text')] : []),
  ];
  if (/mfa/i.test(action)) return [base('policy', 'MFA policy', 'select', ['Required for all administrators', 'Required for privileged actions'])];
  return [{ ...base('note', 'Request notes', 'textarea'), required: false, max: 500 }];
}
function validIp(value: string): boolean {
  const [address, prefix, ...extra] = value.split('/'); if (extra.length) return false;
  let valid = false, max = 32;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) valid = address.split('.').every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255);
  else if (address.includes(':')) { max = 128; try { valid = new URL(`http://[${address}]/`).hostname.startsWith('['); } catch { valid = false; } }
  return valid && (prefix === undefined || /^\d+$/.test(prefix) && Number(prefix) <= max);
}
export default function PreviewActionForm({ action, onReady }: { action: string; onReady: (data: Record<string, unknown>) => void }) {
  const fields = useMemo(() => previewFields(action), [action]); const byId = Object.fromEntries(fields.map(f => [f.id, f]));
  const schema = useMemo(() => createValidationSchema(fields), [fields]);
  const formik = useFormik<FormValues>({ initialValues: Object.fromEntries(fields.map(f => [f.id, f.initial])), validationSchema: schema, validate: values => 'ip' in values && values.ip && !validIp(String(values.ip)) ? { ip: 'Enter a valid IPv4, IPv6 or CIDR range.' } : {}, onSubmit: values => onReady(safeDraft(values, byId)) });
  return <form className="preview-action-form" noValidate aria-label={`${action} preview form`} onSubmit={formik.handleSubmit}>
    <p>Prepare a local request. Nothing will be sent or executed.</p>
    {fields.map(field => <div className="preview-editor-field" key={field.id}><label htmlFor={`preview-${field.id}`}>{field.label}{field.required ? ' *' : ''}</label>
      {field.kind === 'select' ? <div className="preview-editor-select"><CustomDropdown label={field.label} value={String(formik.values[field.id])} items={(field.options || []).map(value => ({ label: value, value }))} onChange={value => formik.setFieldValue(field.id, value)} /></div>
        : field.kind === 'file' ? <input id={`preview-${field.id}`} name={field.id} type="file" accept={field.accept} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; const error = await validateFileContent(file, field); if (error) { formik.setFieldError(field.id, error); formik.setFieldTouched(field.id, true, false); } else formik.setFieldValue(field.id, [file]); }} />
        : field.kind === 'textarea' ? <textarea id={`preview-${field.id}`} name={field.id} value={String(formik.values[field.id] || '')} onChange={formik.handleChange} onBlur={formik.handleBlur} maxLength={field.max || 500} />
        : <input id={`preview-${field.id}`} name={field.id} type="text" inputMode={field.kind === 'number' ? 'decimal' : undefined} value={String(formik.values[field.id] || '')} onChange={formik.handleChange} onBlur={formik.handleBlur} />}
      {(formik.touched[field.id] || formik.submitCount > 0) && formik.errors[field.id] && <span className="preview-editor-error" role="alert">{String(formik.errors[field.id])}</span>}
    </div>)}
    <button className="primary-action" type="submit" disabled={formik.isSubmitting}>Prepare preview request</button>
  </form>;
}
