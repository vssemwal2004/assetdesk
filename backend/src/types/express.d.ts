import type { UserRole, WorkerDataAccess, WorkerPermission } from '@assetdesk/contracts';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        workerId: string;
        role: UserRole;
        permissions: WorkerPermission[];
        dataAccess: WorkerDataAccess;
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
