import { useEffect, useRef, useState, type ReactNode } from 'react';
import CustomDropdown from './CustomDropdown';
import { useRuntime } from './InteractionRuntime';
import type { FieldSpec } from './interactionModel';
import { validateFileContent } from './formValidation';

function FilePreview({ file, remove }: { file: File; remove: () => void }) {
  const [preview, setPreview] = useState('');
  useEffect(() => { const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  return <li className="picked-file">{preview && file.type.startsWith('image/') && <img src={preview} alt={`Preview of ${file.name}`} />}<span><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · selected locally</small>{preview && <a href={preview} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${file.name}`}>Preview</a>}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={remove}>×</button></li>;
}
export default function FormControl({ spec, children }: { spec: FieldSpec; children?: ReactNode }) {
  const runtime = useRuntime(); const { formik } = runtime; const error = runtime.errors[spec.id];
  const value = formik.values[spec.id]; const id = `field-${spec.id}`;
  const [dragging, setDragging] = useState(false); const [checking, setChecking] = useState(false); const picker = useRef<HTMLInputElement>(null); const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const describedBy = error ? `error-${spec.id}` : undefined;
  const common = { id, name: spec.id, 'aria-label': spec.label, 'aria-invalid': !!error, 'aria-describedby': describedBy, 'aria-required': spec.required || undefined, disabled: spec.disabled, onBlur: () => formik.setFieldTouched(spec.id, true) };
  let control: ReactNode;
  if (spec.kind === 'checkbox') {
    control = <input {...common} className="native-checkbox" type="checkbox" checked={value === true} onChange={e => formik.setFieldValue(spec.id, e.target.checked)} />;
  } else if (spec.kind === 'select') {
    control = <div id={id} tabIndex={-1} className="field-dropdown-wrapper"><CustomDropdown label={spec.label} invalid={!!error} value={String(value || '')} items={(spec.options || []).map(option => ({ label: option, value: option }))} searchable={(spec.options?.length || 0) > 6} onChange={option => { formik.setFieldValue(spec.id, option); formik.setFieldTouched(spec.id, true, false); }} /></div>;
  } else if (spec.kind === 'file') {
    const files = Array.isArray(value) ? value : [];
    const select = async (incoming: File[]) => {
      if (!incoming.length) return;
      if (!spec.multiple && incoming.length > 1) { runtime.notify('Select one file for this field.'); return; }
      const token = ++request.current; setChecking(true);
      const error = (await Promise.all(incoming.map(file => validateFileContent(file, spec)))).find(Boolean);
      if (token !== request.current) return;
      setChecking(false);
      if (error) { formik.setFieldError(spec.id, error); formik.setFieldTouched(spec.id, true, false); runtime.notify(error); if (picker.current) picker.current.value = ''; return; }
      if (spec.multiple && files.length + incoming.length > 10) { runtime.notify('Select no more than 10 files.'); return; }
      const selected = spec.multiple ? [...files, ...incoming].filter((file, index, all) => all.findIndex(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) === index) : incoming.slice(0, 1);
      formik.setFieldValue(spec.id, selected); formik.setFieldTouched(spec.id, true, false); if (picker.current) picker.current.value = '';
    };
    control = <div className={`file-picker-surface ${dragging ? 'is-dragging' : ''}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); select(Array.from(e.dataTransfer.files)); }}>
      {!files.length && <div className="file-picker-art" aria-hidden="true">{children}</div>}
      <input {...common} ref={picker} type="file" tabIndex={-1} className="visually-hidden" accept={spec.accept} multiple={spec.multiple} onChange={e => select(Array.from(e.target.files || []))} />
      {files.length ? <div className="selected-files"><ul>{files.map((file, index) => <FilePreview key={`${file.name}-${file.lastModified}`} file={file} remove={() => { request.current++; setChecking(false); formik.setFieldValue(spec.id, files.filter((_, i) => i !== index)); if (picker.current) picker.current.value = ''; }} />)}</ul><button type="button" className="secondary-action" onClick={() => picker.current?.click()}>{spec.multiple ? 'Add files' : 'Replace file'}</button></div> : <button className="file-picker-button" type="button" aria-label={`Choose ${spec.label}`} disabled={checking} onClick={() => picker.current?.click()} />}
      {checking && <span className="file-checking" role="status">Checking file…</span>}
    </div>;
  } else {
    const inputProps = { ...common, className: 'native-field', placeholder: spec.placeholder, value: typeof value === 'string' ? value : '', onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => formik.setFieldValue(spec.id, e.target.value) };
    if (spec.kind === 'textarea') control = <textarea {...inputProps} maxLength={spec.max || 500} />;
    else {
      const type = spec.kind === 'email' ? 'email' : spec.kind === 'url' ? 'url' : spec.kind === 'phone' ? 'tel' : ['password', 'confirmPassword'].includes(spec.kind) && !runtime.passwordVisible.has(spec.id) ? 'password' : 'text';
      control = <input {...inputProps} type={type} inputMode={spec.kind === 'number' ? 'decimal' : undefined} autoComplete={spec.kind === 'email' ? 'email' : spec.kind === 'password' ? /login/.test(runtime.screen.route) ? 'current-password' : 'new-password' : spec.kind === 'confirmPassword' ? 'new-password' : /full name/i.test(spec.label) ? 'name' : 'off'} />;
    }
  }
  return <div className={`native-field-shell field-${spec.kind} ${error ? 'field-has-error' : ''}`}>{control}{error && <span className="inline-field-error" id={`error-${spec.id}`}>{error}</span>}</div>;
}
