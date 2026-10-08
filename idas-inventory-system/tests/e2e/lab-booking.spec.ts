import { expect, test } from '@playwright/test';
import { futureMonday, login, logout } from './helpers';

test('lecturer books → dean approves → slot reserved → lecturer notified', async ({ page }) => {
  const date = futureMonday();
  const course = `E2E Course ${Date.now()}`;

  // Lecturer submits a booking
  await login(page, 'lecturer@idas.pdn.ac.lk');
  await page.getByRole('link', { name: 'Lab Booking' }).click();
  await page.getByLabel('Course / module *').fill(course);
  await page.getByLabel('Module code *').fill('E2E101');
  await page.getByLabel('Batch / year *').fill('2nd year');
  await page.getByLabel('Students *').fill('12');
  await page.getByLabel('Purpose *').fill('Automated browser test');
  await page.getByLabel('Date *').fill(date);
  await page.getByLabel('Start *').fill('10:00');
  await page.getByLabel('End *').fill('12:00');
  await page.getByLabel('Number of computers').fill('5');
  await expect(page.getByText('Slot and resources available')).toBeVisible();
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText(/Booking submitted/)).toBeVisible();
  await expect(page.getByRole('cell', { name: new RegExp(course) })).toBeVisible();
  await logout(page);

  // Dean receives the request and approves it
  await login(page, 'dean@idas.pdn.ac.lk');
  await page.getByRole('link', { name: 'Notifications' }).click();
  await expect(page.getByText('New lab booking request').first()).toBeVisible();
  await page.getByRole('link', { name: 'Booking Approvals' }).click();
  const card = page.locator('section', { hasText: course });
  await expect(card.getByText('Available', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Decision recorded/)).toBeVisible();
  await logout(page);

  // Lecturer sees the approval and the booking in the calendar/history
  await login(page, 'lecturer@idas.pdn.ac.lk');
  await page.getByRole('link', { name: 'Notifications' }).click();
  await expect(page.getByText(/approved/i).first()).toBeVisible();
  await page.getByRole('link', { name: 'Lab Booking' }).click();
  await expect(page.getByRole('row', { name: new RegExp(course) }).getByText('Approved')).toBeVisible();

  // Trying to book the same slot again is refused
  await page.getByLabel('Course / module *').fill('Clash');
  await page.getByLabel('Module code *').fill('CLASH');
  await page.getByLabel('Batch / year *').fill('1st');
  await page.getByLabel('Purpose *').fill('Should be blocked');
  await page.getByLabel('Date *').fill(date);
  await page.getByLabel('Start *').fill('11:00');
  await page.getByLabel('End *').fill('13:00');
  await expect(page.getByText('Not available')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit request' })).toBeDisabled();
});

test('students cannot open staff pages', async ({ page }) => {
  await login(page, 'student@idas.pdn.ac.lk');
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Audit Logs' })).toHaveCount(0);
  await page.goto('/audit');
  await expect(page.getByText('Access denied')).toBeVisible();
});
