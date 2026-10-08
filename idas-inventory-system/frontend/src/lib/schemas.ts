import { z } from 'zod';

const req = (label: string) => z.string().trim().min(1, `${label} is required`);

export const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });

export const passwordSchema = z.string().min(10, 'At least 10 characters').regex(/[a-z]/, 'Needs a lower-case letter').regex(/[A-Z]/, 'Needs an upper-case letter').regex(/\d/, 'Needs a digit');

export const changePasswordSchema = z.object({ current: req('Current password'), next: passwordSchema, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const userSchema = z.object({
  fullName: z.string().trim().min(2, 'Name is required'), email: z.string().trim().email('Valid email required'),
  role: req('Role'), universityId: z.string().optional(), phone: z.string().optional(), departmentId: z.string().optional(), password: passwordSchema,
});

export const assetSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'), categoryId: req('Category'), brand: z.string().optional(), model: z.string().optional(),
  serialNumber: z.string().optional(), description: z.string().optional(), locationId: z.string().optional(), condition: z.string().default('GOOD'),
  quantity: z.coerce.number().int().min(1, 'At least 1').default(1), notes: z.string().optional(),
  specs: z.string().optional(), // "RAM=16GB, CPU=i5"
  acquiredAt: z.string().optional(), supplier: z.string().optional(), invoiceRef: z.string().optional(), value: z.union([z.literal(''), z.coerce.number().min(0, 'Cannot be negative')]).optional(),
  fundingSource: z.string().optional(), warrantyStart: z.string().optional(), warrantyEnd: z.string().optional(),
}).refine((v) => !v.warrantyStart || !v.warrantyEnd || v.warrantyEnd >= v.warrantyStart, { path: ['warrantyEnd'], message: 'Warranty end must be after start' });

export const loanSchema = z.object({
  purpose: z.string().trim().min(3, 'Describe the purpose'), useLocation: z.string().trim().min(2, 'Where will it be used?'),
  requiredFrom: req('Start date/time'), dueAt: req('Return date/time'), notes: z.string().optional(),
  agree: z.literal(true, { errorMap: () => ({ message: 'You must accept the borrowing terms' }) }),
}).refine((v) => !v.requiredFrom || !v.dueAt || v.dueAt > v.requiredFrom, { path: ['dueAt'], message: 'Return must be after start' });

export const bookingSchema = z.object({
  staffId: req('Staff ID'), department: req('Department'), course: req('Course / module'), moduleCode: req('Module code'), purpose: z.string().trim().min(3, 'Purpose is required'),
  batchYear: req('Batch / year'), studentCount: z.coerce.number().int().min(1, 'At least 1 student').max(500),
  date: req('Date'), startTime: req('Start time'), endTime: req('End time'),
  computersNeeded: z.coerce.number().int().min(0).max(200).default(0), software: z.string().optional(), osSpecs: z.string().optional(), specialRequirements: z.string().optional(),
}).refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, { path: ['endTime'], message: 'End must be after start' });

export const maintenanceSchema = z.object({ assetId: req('Asset'), problem: z.string().trim().min(3, 'Describe the problem'), priority: z.string().default('MEDIUM'), notes: z.string().optional() });
export const damageSchema = z.object({ assetId: req('Asset'), description: z.string().trim().min(3, 'Describe the damage'), severity: req('Severity'), location: z.string().optional(), estimatedCost: z.union([z.literal(''), z.coerce.number().min(0, 'Cannot be negative')]).optional() });

/** "RAM=16GB, CPU=i5" → [{key:'RAM',value:'16GB'}, …] */
export function parseSpecs(s?: string) {
  return (s ?? '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf('='); return i > 0 ? { key: x.slice(0, i).trim(), value: x.slice(i + 1).trim() } : null; }).filter(Boolean) as { key: string; value: string }[];
}
