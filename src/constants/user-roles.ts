export const userRoles = ['super-admin', 'admin', 'kitchen', 'waiter', 'delivery'] as const;

export type UserRole = (typeof userRoles)[number];

export const staffRoles = ['admin', 'kitchen', 'waiter', 'delivery'] as const;