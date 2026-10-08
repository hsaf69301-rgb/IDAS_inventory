import { expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Idas@2026Demo';

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/login/);
}

/** A Monday far in the future so repeated runs on the same database never collide. */
export function futureMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 7 * (40 + Math.floor(Math.random() * 400)));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
