export const humanize = (s?: string | null) => (s ? s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
export const money = (n?: number | null) => (n == null ? '—' : new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(n));
export const ASSET_STATUSES = ['AVAILABLE', 'IN_USE', 'RESERVED', 'BORROWED', 'OVERDUE', 'UNDER_INSPECTION', 'UNDER_MAINTENANCE', 'UNDER_REPAIR', 'DAMAGED', 'MISSING', 'LOST', 'RETIRED', 'DISPOSED'];
export const CONDITIONS = ['NEW', 'EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'NON_FUNCTIONAL'];
export const SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const MAINT_STEPS = ['REPORTED', 'DIAGNOSING', 'ASSIGNED', 'UNDER_REPAIR', 'REPAIRED', 'AWAITING_VERIFICATION', 'VERIFIED', 'CLOSED'];
