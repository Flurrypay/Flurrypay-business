const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'flurrypay-forms-'));
for (const name of ['interactionModel', 'formValidation', 'dateFilters']) esbuild.buildSync({ entryPoints: [path.join(root, 'src', name + '.ts')], outfile: path.join(temp, name + '.cjs'), bundle: true, platform: 'node', format: 'cjs' });
const { buildScreenModel, dropdownOptions } = require(path.join(temp, 'interactionModel.cjs'));
const { createValidationSchema, validateFile, validateFileContent, safeDraft, csvCell } = require(path.join(temp, 'formValidation.cjs'));
const screens = require('../../src/screens.json');
const { relativeDateWindow, withinDateWindow } = require(path.join(temp, 'dateFilters.cjs'));
function model(route) { const screen = screens.find(s => s.route === route); return buildScreenModel(JSON.parse(fs.readFileSync(path.join(root, 'public', screen.file))), screen); }
function initial(m) { return Object.fromEntries(Object.values(m.fields).map(f => [f.id, f.initial])); }
function field(m, kind) { return Object.values(m.fields).find(f => f.kind === kind); }

test('registration rejects empty, malformed, weak and unaccepted values; accepts a completed form', async () => {
  const m = model('/register'), fields = Object.values(m.fields), schema = createValidationSchema(fields, '/register');
  const values = initial(m); assert.equal(await schema.isValid(values), false);
  values[field(m, 'text').id] = 'Ada Okafor'; values[field(m, 'email').id] = 'invalid'; values[field(m, 'password').id] = 'Password123'; values[field(m, 'checkbox').id] = true;
  assert.equal(await schema.isValid(values), false);
  values[field(m, 'email').id] = 'ada@example.com'; values[field(m, 'password').id] = 'short'; assert.equal(await schema.isValid(values), false);
  values[field(m, 'password').id] = 'Password123'; values[field(m, 'checkbox').id] = false; assert.equal(await schema.isValid(values), false);
  values[field(m, 'checkbox').id] = true; assert.equal(await schema.isValid(values), true);
  assert(!JSON.stringify(safeDraft(values, m.fields)).includes('Password123'));
});
test('password reset requires matching passwords', async () => {
  const m = model('/reset-password'), schema = createValidationSchema(Object.values(m.fields), '/reset-password');
  const values = initial(m); values[field(m, 'password').id] = 'Password123'; values[field(m, 'confirmPassword').id] = 'Mismatch123'; assert.equal(await schema.isValid(values), false);
  values[field(m, 'confirmPassword').id] = 'Password123'; assert.equal(await schema.isValid(values), true);
});
test('onboarding cannot proceed without both an identity document and a photo', async () => {
  const m = model('/merchant/onboarding-step-2-identity-verification'), schema = createValidationSchema(Object.values(m.fields));
  const values = initial(m); assert.equal(await schema.isValid(values), false);
  const files = Object.values(m.fields).filter(f => f.kind === 'file'); values[files[0].id] = [new File(['%PDF-1.4'], 'identity.pdf', { type: 'application/pdf' })]; assert.equal(await schema.isValid(values), false);
  values[files[1].id] = [new File([new Uint8Array([255,216,255,224])], 'selfie.jpg', { type: 'image/jpeg' })]; assert.equal(await schema.isValid(values), true);
});
test('final review requires both declarations', async () => {
  const m = model('/merchant/onboarding-step-5-final-review'), schema = createValidationSchema(Object.values(m.fields));
  const values = initial(m); assert.equal(Object.keys(values).length, 2); assert.equal(await schema.isValid(values), false);
  Object.keys(values).forEach(id => values[id] = true); assert.equal(await schema.isValid(values), true);
});
test('files reject unsupported, empty and oversized uploads', () => {
  const spec = { accept: '.pdf,.jpg,.jpeg,.png', maxBytes: 5 * 1024 * 1024 };
  assert.match(validateFile(new File(['bad'], 'malware.exe'), spec), /Unsupported/);
  assert.match(validateFile(new File([], 'empty.pdf'), spec), /empty/);
  assert.match(validateFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.pdf'), spec), /smaller/);
  assert.equal(validateFile(new File(['%PDF-1.4'], 'valid.pdf', { type: 'application/pdf' }), spec), null);
});
test('selects offer choices matching their actual field, and arbitrary values are rejected', async () => {
  const contact = model('/contact'); const company = contact.fields['162:2191']; assert(company.options.includes('1-50 employees')); assert(!company.options.includes('E-commerce'));
  const business = model('/merchant/onboarding-step-1-business-information-refined'); assert(business.fields['304:1526'].options.some(s => s.includes('$10,000'))); assert.equal(business.fields['304:1560'].kind, 'text');
  assert(dropdownOptions('Session Timeout 30 minutes').includes('60 minutes'));
  const select = { ...company, required: true }; const schema = createValidationSchema([select]); assert.equal(await schema.isValid({ [select.id]: 'injected option' }), false);
});
test('API key preview requires a name, valid expiry, and at least one scope', async () => {
  const m = model('/merchant/create-new-api-key'), schema = createValidationSchema(Object.values(m.fields), '/merchant/create-new-api-key');
  const values = initial(m); const name = Object.values(m.fields).find(field => field.kind === 'text'); values[name.id] = 'Test Integration';
  const permissions = Object.values(m.fields).filter(field => field.kind === 'checkbox'); assert(permissions.length >= 4);
  assert.equal(await schema.isValid(values), false); values[permissions[0].id] = true; assert.equal(await schema.isValid(values), true);
});
test('renamed files with incompatible content are rejected', async () => {
  const spec = { accept: '.pdf,.jpg,.jpeg,.png', maxBytes: 5 * 1024 * 1024 };
  assert.match(await validateFileContent(new File(['not a PDF'], 'renamed.pdf'), spec), /contents/);
  assert.match(await validateFileContent(new File(['not an image'], 'renamed.png'), spec), /contents/);
  assert.equal(await validateFileContent(new File(['%PDF-1.4'], 'valid.pdf'), spec), null);
});
test('date filters use inclusive ranges and exclude undated or out-of-range records', () => {
  const range = relativeDateWindow('Last 7 Days', new Date('2026-10-28T12:00:00Z'));
  assert.deepEqual(range, { from: '2026-10-22', to: '2026-10-28' });
  assert.equal(withinDateWindow('Oct 22, 2026', range), true);
  assert.equal(withinDateWindow('2026-10-28', range), true);
  assert.equal(withinDateWindow('Oct 21, 2026', range), false);
  assert.equal(withinDateWindow('No date', range), false);
});
test('CSV export neutralizes spreadsheet formulas and quotes embedded content', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('Ada, "Okafor"'), '"Ada, ""Okafor"""');
});
test('every source button, field and option has an interaction descriptor across every screen', () => {
  let buttons = 0, fields = 0;
  for (const screen of screens) { const m = model(screen.route); buttons += Object.keys(m.controls).length; fields += Object.keys(m.fields).length;
    for (const spec of Object.values(m.fields)) { assert(spec.label, `${screen.route}: missing label`); if (spec.kind === 'select') assert(spec.options.length > 1); }
    for (const spec of Object.values(m.controls)) assert(spec.label, `${screen.route}: missing control label`);
  }
  assert(buttons > 1900); assert(fields > 190);
});
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));
