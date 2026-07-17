import { Router, type Request, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  AccountStatusSchema,
  CreateWorkerRequestSchema,
  UpdateWorkerRequestSchema,
  UpdateWorkerStatusRequestSchema,
  WorkerIdSchema,
} from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';
import { appendAuditEvent } from '../audit/audit.service.js';
import {
  requireAuth,
  requireCsrf,
  requireFullAccess,
  requireRole,
  requireTrustedOrigin,
} from '../auth/auth.middleware.js';
import { commitWorkerImport, previewWorkerImport } from './worker-import.service.js';
import {
  createWorker,
  deleteWorker,
  getWorker,
  listWorkers,
  regenerateWorkerCredential,
  updateWorker,
  updateWorkerStatus,
} from './worker.service.js';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const OptionalQueryTextSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().trim().min(1).max(120).optional(),
);

const WorkerListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: OptionalQueryTextSchema,
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    AccountStatusSchema.optional(),
  ),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMPORT_BYTES,
    files: 1,
    fields: 0,
  },
});

const uploadWorkerFile: RequestHandler = (request, response, next) => {
  upload.single('file')(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      next(
        new AppError(
          413,
          'WORKER_IMPORT_FILE_TOO_LARGE',
          'Upload a CSV or XLSX file no larger than 5 MB.',
        ),
      );
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, 'WORKER_IMPORT_UPLOAD_INVALID', 'Upload one file in the file field.'));
      return;
    }
    next(error);
  });
};

function workerId(request: Request): string {
  return WorkerIdSchema.parse(request.params.workerId);
}

function authenticatedUserId(request: Request): string {
  if (!request.auth) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  return request.auth.userId;
}

async function audit(
  request: Request,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const actor = request.auth;
  if (!actor) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue.');
  await appendAuditEvent({
    requestId: request.requestId,
    actorUserId: actor.userId,
    actorWorkerId: actor.workerId,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    result: 'SUCCESS',
    ...(metadata ? { metadata } : {}),
  });
}

function secureManagementRouter(): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth, requireFullAccess, requireRole('ADMIN'));
  return router;
}

export function createWorkersRouter(): Router {
  const router = secureManagementRouter();

  router.get('/', async (request, response, next) => {
    try {
      const input = WorkerListQuerySchema.parse(request.query);
      const result = await listWorkers({
        page: input.page,
        pageSize: input.pageSize,
        ...(input.search ? { search: input.search } : {}),
        ...(input.status ? { status: input.status } : {}),
      });
      response.json({
        data: result.workers,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', requireTrustedOrigin, requireCsrf, async (request, response, next) => {
    try {
      const input = CreateWorkerRequestSchema.parse(request.body);
      const result = await createWorker(input, authenticatedUserId(request));
      await audit(request, 'WORKER_CREATED', 'USER', result.worker.workerId);
      response.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:workerId', async (request, response, next) => {
    try {
      response.json({ data: { worker: await getWorker(workerId(request)) } });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:workerId', requireTrustedOrigin, requireCsrf, async (request, response, next) => {
    try {
      const id = workerId(request);
      const input = UpdateWorkerRequestSchema.parse(request.body);
      const worker = await updateWorker(id, input);
      await audit(request, 'WORKER_UPDATED', 'USER', id, { fields: Object.keys(input) });
      response.json({ data: { worker } });
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    '/:workerId/status',
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const id = workerId(request);
        const input = UpdateWorkerStatusRequestSchema.parse(request.body);
        const result = await updateWorkerStatus(id, input.status);
        await audit(request, 'WORKER_STATUS_CHANGED', 'USER', id, {
          previousStatus: result.previousStatus,
          status: result.worker.status,
        });
        response.json({ data: { worker: result.worker } });
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete('/:workerId', requireTrustedOrigin, requireCsrf, async (request, response, next) => {
    try {
      const id = workerId(request);
      await deleteWorker(id);
      await audit(request, 'WORKER_DELETED', 'USER', id);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post(
    '/:workerId/regenerate-credentials',
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const id = workerId(request);
        const result = await regenerateWorkerCredential(id);
        await audit(request, 'WORKER_CREDENTIAL_REGENERATED', 'USER', id);
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

export function createWorkerImportsRouter(): Router {
  const router = secureManagementRouter();

  router.post(
    '/preview',
    requireTrustedOrigin,
    requireCsrf,
    uploadWorkerFile,
    async (request, response, next) => {
      try {
        if (!request.file) {
          throw new AppError(400, 'WORKER_IMPORT_FILE_REQUIRED', 'Choose a CSV or XLSX file.');
        }
        const result = await previewWorkerImport(request.file, authenticatedUserId(request));
        await audit(request, 'WORKER_IMPORT_PREVIEWED', 'WORKER_IMPORT', result.importId, {
          totalRows: result.totalRows,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
        });
        response.status(201).json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    '/:importId/commit',
    requireTrustedOrigin,
    requireCsrf,
    async (request, response, next) => {
      try {
        const result = await commitWorkerImport(
          z.string().parse(request.params.importId),
          authenticatedUserId(request),
        );
        await audit(request, 'WORKER_IMPORT_COMMITTED', 'WORKER_IMPORT', result.importId, {
          createdCount: result.created.length,
          failedCount: result.failed.length,
        });
        response.json({ data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
