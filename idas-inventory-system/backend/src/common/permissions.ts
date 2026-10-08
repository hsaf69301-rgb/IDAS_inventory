import { RoleName } from '@prisma/client';

/** Every permission code in the system. Source of truth for RBAC (also seeded to DB for display). */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard:view',
  USER_READ: 'user:read',
  USER_WRITE: 'user:write',
  ROLE_READ: 'role:read',
  ASSET_READ: 'asset:read',
  ASSET_WRITE: 'asset:write',
  ASSET_MOVE: 'asset:move',
  LOOKUP_WRITE: 'lookup:write',
  LOAN_REQUEST: 'loan:request',
  LOAN_READ_ALL: 'loan:read-all',
  LOAN_MANAGE: 'loan:manage',
  BOOKING_REQUEST: 'booking:request',
  BOOKING_READ_ALL: 'booking:read-all',
  BOOKING_DECIDE: 'booking:decide',
  MAINT_READ: 'maintenance:read',
  MAINT_REPORT: 'maintenance:report',
  MAINT_MANAGE: 'maintenance:manage',
  MAINT_VERIFY: 'maintenance:verify',
  DAMAGE_REPORT: 'damage:report',
  DAMAGE_MANAGE: 'damage:manage',
  STOCKTAKE_MANAGE: 'stocktake:manage',
  REPORT_VIEW: 'report:view',
  AUDIT_READ: 'audit:read',
  SETTINGS_MANAGE: 'settings:manage',
} as const;
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;
const borrower: PermissionCode[] = [P.ASSET_READ, P.LOAN_REQUEST, P.DAMAGE_REPORT];

export const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  ADMIN: Object.values(P),
  TECHNICIAN: [
    P.DASHBOARD_VIEW, P.ASSET_READ, P.ASSET_WRITE, P.ASSET_MOVE, P.LOOKUP_WRITE,
    P.LOAN_READ_ALL, P.LOAN_MANAGE, P.BOOKING_READ_ALL,
    P.MAINT_READ, P.MAINT_REPORT, P.MAINT_MANAGE, P.MAINT_VERIFY,
    P.DAMAGE_REPORT, P.DAMAGE_MANAGE, P.STOCKTAKE_MANAGE, P.REPORT_VIEW,
  ],
  LECTURER: [...borrower, P.BOOKING_REQUEST, P.BOOKING_READ_ALL, P.MAINT_REPORT],
  DEAN_REGISTRAR: [P.DASHBOARD_VIEW, P.ASSET_READ, P.BOOKING_READ_ALL, P.BOOKING_DECIDE, P.REPORT_VIEW],
  STUDENT: borrower,
  UNIVERSITY_STAFF: borrower,
  TRAINEE: borrower,
};

export const ROLE_LABELS: Record<RoleName, string> = {
  ADMIN: 'Admin',
  TECHNICIAN: 'Lab Staff / Technician',
  LECTURER: 'Lecturer',
  DEAN_REGISTRAR: 'Dean / Registrar',
  STUDENT: 'Student',
  UNIVERSITY_STAFF: 'University Staff',
  TRAINEE: 'Trainee',
};

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'dashboard:view': 'View management dashboard',
  'user:read': 'View users', 'user:write': 'Create/update/deactivate users',
  'role:read': 'View roles and permissions',
  'asset:read': 'Search and view assets', 'asset:write': 'Create/update assets',
  'asset:move': 'Move assets between locations',
  'lookup:write': 'Manage categories and locations',
  'loan:request': 'Submit equipment requests', 'loan:read-all': 'View all loans',
  'loan:manage': 'Approve, issue, receive and inspect loans',
  'booking:request': 'Submit lab booking requests', 'booking:read-all': 'View all bookings/calendar',
  'booking:decide': 'Approve or reject lab bookings',
  'maintenance:read': 'View maintenance', 'maintenance:report': 'Report faults',
  'maintenance:manage': 'Run repair workflow', 'maintenance:verify': 'Verify repairs',
  'damage:report': 'Report damage', 'damage:manage': 'Manage damage/lost reports',
  'stocktake:manage': 'Run stocktakes', 'report:view': 'View and export reports',
  'audit:read': 'View audit log', 'settings:manage': 'Manage system settings',
};
