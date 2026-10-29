const { chromium } = require('playwright-core');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL || 'http://127.0.0.1:5178';
const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => fs.existsSync(path));
if (!chrome) throw new Error('Set CHROME_PATH to an installed Chrome or Chromium executable.');
const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% Local UI fixture') });
const photo = { name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255,216,255,224,0,16,74,70,73,70]) };
(async () => {
  const browser = await chromium.launch({ executablePath: chrome, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.setDefaultTimeout(10000); const errors = []; page.on('pageerror', e => errors.push(e.message));
    const go = async route => { await page.goto(base + route); await page.waitForSelector('.screen-root'); };
    const select = async (label, option) => { await page.getByRole('button', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); };
    const fill = async (label, value) => page.getByRole('textbox', { name: label, exact: true }).fill(value);
    const click = async label => page.getByRole('button', { name: label, exact: true }).click();
    await go('/register'); await click('Create free account'); await page.getByRole('alert').first().waitFor(); assert(await page.getByRole('alert').count());
    await fill('Full Name', 'Ada Okafor'); await fill('Work Email', 'ada@example.com'); await page.locator('input[autocomplete="new-password"]').fill('Password123');
    await click('Show password'); assert.equal(await page.locator('input[autocomplete="new-password"]').getAttribute('type'), 'text');
    await page.getByRole('checkbox').check(); await click('Create free account'); await page.getByRole('dialog').waitFor(); assert(!(await page.getByRole('dialog').innerText()).includes('Password123')); await click('Continue preview'); await page.waitForURL('**/merchant/onboarding-step-1-business-information-refined');
    for (const [label, value] of Object.entries({ 'Legal Business Name': 'Acme Preview Ltd', 'Business Registration Number (EIN/CRN/VAT)': 'RC-123456', 'Year of Incorporation': '2024', 'Business Website': 'https://example.com', 'Street Address': '123 Test Street', 'City': 'Lagos', 'State / Province': 'Lagos', 'ZIP / Postal Code': '100001' })) await fill(label, value);
    await select('Business Type', 'Limited Liability Company'); await select('Industry Category', 'Technology'); await select('Estimated Monthly Transaction Volume', 'Under $10,000'); await select('Country', 'Nigeria'); await click('Continue'); await page.waitForURL('**/merchant/onboarding-step-2-identity-verification');
    await click('Continue'); await page.getByRole('alert').first().waitFor(); assert(await page.getByRole('alert').count());
    await page.locator('input[type="file"]').setInputFiles({ name: 'unsupported.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') }); await page.getByText('Unsupported file type.', { exact: false }).first().waitFor();
    await page.locator('input[type="file"]').setInputFiles(pdf('identity.pdf')); await page.getByRole('button', { name: 'Remove identity.pdf' }).waitFor(); await click('Remove identity.pdf'); await page.locator('input[type="file"]').setInputFiles(pdf('identity.pdf'));
    await click('Take Selfie'); await page.getByRole('dialog').locator('input[type=file]').setInputFiles(photo); await page.getByRole('button', { name: 'Retake selfie' }).waitFor(); await click('Continue'); await page.waitForURL('**/merchant/onboarding-step-3-legal-compliance');
    await page.locator('input[type=file]').setInputFiles(pdf('registration.pdf')); await page.getByRole('button', { name: 'Remove registration.pdf' }).waitFor(); await select('Source of Funds', 'Business Revenue'); await fill('Expected Monthly Volume', '10000'); await click('Continue to Step 4'); await page.waitForURL('**/merchant/onboarding-step-4-proof-of-address').catch(async error => { console.log('Step 3 failure:', await page.locator('.validation-summary').allTextContents(), await page.locator('.interaction-notice').allTextContents()); throw error; });
    await page.locator('input[type=file]').setInputFiles(pdf('address.pdf')); await page.getByRole('button', { name: 'Remove address.pdf' }).waitFor(); await click('Continue to Step 5'); await page.waitForURL('**/merchant/onboarding-step-5-final-review');
    assert((await page.locator('.screen-root').innerText()).includes('Acme Preview Ltd')); assert((await page.locator('.screen-root').innerText()).includes('Not submitted'));
    await click('Submit for Verification'); await page.getByRole('alert').first().waitFor(); assert(await page.getByRole('alert').count());
    for (const box of await page.getByRole('checkbox').all()) await box.check(); await click('Submit for Verification'); await page.getByRole('dialog', { name: 'Verification draft ready' }).waitFor();
    assert((await page.getByRole('dialog').innerText()).includes('registration.pdf')); assert((await page.getByRole('dialog').innerText()).includes('has not run')); await click('Close');
    await go('/merchant/transactions'); await select('Status', 'Pending'); assert((await page.locator('.selected-control-label').first().innerText()).includes('Pending'));
    const details = page.getByRole('button', { name: 'Details', exact: true }); if (await details.count()) { await details.first().click(); await page.getByRole('dialog').waitFor(); await click('Close'); }
    await go('/merchant/us-dollar-wallet-details'); await click('Deposit'); await page.getByRole('dialog').waitFor(); await page.getByRole('textbox', { name: 'Amount', exact: false }).fill('-1'); await click('Prepare preview request'); await page.getByRole('alert').first().waitFor(); assert(await page.getByRole('alert').count()); await page.getByRole('textbox', { name: 'Amount', exact: false }).fill('100'); await click('Prepare preview request'); await page.getByRole('dialog', { name: 'Preview request ready' }).waitFor(); await click('Close');
    await go('/merchant/create-new-api-key'); await page.getByPlaceholder('e.g., Mobile App Integration', { exact: true }).fill('Test integration'); await click('Generate Key'); await page.getByRole('alert').first().waitFor(); assert(await page.getByRole('alert').count()); await page.getByRole('checkbox').first().check(); await click('Generate Key'); await page.getByRole('dialog').waitFor(); assert((await page.getByRole('dialog').innerText()).includes('demo_')); await click('Close');
    await go('/'); await select('Products', 'Cross-border Payments'); await page.waitForURL('**/products/cross-border-payments-flurrypay');
    await page.setViewportSize({ width: 390, height: 844 }); await go('/merchant'); await click('Open navigation'); await page.locator('.mobile-navigation').getByRole('link', { name: 'Wallets', exact: true }).click(); await page.waitForURL('**/merchant/wallets'); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    await go('/contact'); const dropdown = page.getByRole('button', { name: 'Company Size', exact: true }); await dropdown.focus(); await page.keyboard.press('ArrowDown'); await page.getByRole('listbox').waitFor(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); assert.equal(await dropdown.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(errors, []); console.log('PASS: registration, all five onboarding steps, upload rejection/preview/removal, selfie photo selection, real review values, declarations, table filter, homepage menu, mobile navigation keyboard dropdown selection, amount validation and demo API-key scope validation.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
