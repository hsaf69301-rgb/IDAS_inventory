import { expect, test } from '@playwright/test';
import { login, logout } from './helpers';

test('equipment: request → approve → issue → return → inspect → available', async ({ page }) => {
  const purpose = `E2E loan ${Date.now()}`;
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 11) + '09:00';
  const later = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 11) + '17:00';

  await login(page, 'trainee@idas.pdn.ac.lk');
  await page.getByRole('link', { name: 'Equipment Requests' }).click();
  await page.getByLabel('Search equipment').fill('Precision Screwdriver');
  await page.getByRole('button').filter({ has: page.locator('svg.lucide-plus') }).first().click();
  await page.getByLabel('Purpose *').fill(purpose);
  await page.getByLabel('Where will it be used? *').fill('IDAS Lab bench');
  await page.getByLabel('Required from *').fill(tomorrow);
  await page.getByLabel('Expected return *').fill(later);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText(/Request submitted/)).toBeVisible();
  await logout(page);

  await login(page, 'technician@idas.pdn.ac.lk');
  await page.getByRole('link', { name: 'Loans' }).click();
  const row = () => page.getByRole('row', { name: new RegExp(purpose) });
  await row().getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('tab', { name: 'Approved' }).click();
  await row().getByRole('button', { name: 'Issue' }).click();
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await expect(page.getByText('Equipment issued')).toBeVisible();
  await page.getByRole('tab', { name: 'On loan' }).click();
  await row().getByRole('button', { name: 'Receive return' }).click();
  await page.getByRole('button', { name: 'Record return' }).click();
  await expect(page.getByText(/awaiting inspection/)).toBeVisible();

  await page.getByRole('link', { name: /Precision Screwdriver/ }).first().click();
  await page.getByRole('button', { name: 'Inspect' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/asset available/)).toBeVisible();
});
