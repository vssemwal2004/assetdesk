import type { UserRole, WorkerPermission } from '@assetdesk/contracts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        workerId: string;
        role: UserRole;
        permissions: WorkerPermission[];
        sid: string;
        authVersion: number;
        mustChangePassword: boolean;
        purpose: 'FULL_ACCESS' | 'PASSWORD_CHANGE';
        csrfTokenHash: string;
      };
    }
  }
}

export {};
