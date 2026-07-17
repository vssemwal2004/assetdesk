import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetApiClientState } from '../lib/api-client';
import { App } from './app';

const admin = {
  id: 'admin-user-id',
  workerId: 'GEU-WRK-A7K4',
  name: 'Anita Sharma',
  email: 'anita.sharma@university.edu',
  contact: '9876543210',
  department: 'IT Services',
  role: 'ADMIN',
  status: 'ACTIVE',
  mustChangePassword: false,
} as const;

const worker = {
  id: 'worker-user-id',
  workerId: 'GEU-WRK-B8M5',
  name: 'Ravi Mehta',
  email: 'ravi.mehta@university.edu',
  contact: null,
  department: 'Server Operations',
  role: 'WORKER',
  status: 'INVITED',
  mustChangePassword: true,
} as const;

const activeWorker = {
  ...worker,
  status: 'ACTIVE',
  mustChangePassword: false,
} as const;

const issueSummary = {
  id: 'issue-document-id',
  issueId: 'GEU-ISS-2026-000123',
  receiver: {
    receiverCode: 'GEU-RCV-000125',
    fullName: 'Neha Verma',
    universityId: 'FAC-112',
    type: 'FACULTY',
    department: 'Computer Science',
    contact: '9876543210',
    email: 'neha.verma@university.edu',
  },
  issuedBy: {
    userId: 'admin-user-id',
    workerId: 'GEU-WRK-A7K4',
    name: 'Anita Sharma',
    role: 'ADMIN',
  },
  issuedAt: '2026-07-15T09:00:00.000Z',
  expectedReturnAt: '2026-07-22T09:00:00.000Z',
  duePreset: 'ONE_WEEK',
  status: 'ISSUED',
  purpose: 'Lab setup',
  notes: null,
  totalIssuedQuantity: 2,
  totalOutstandingQuantity: 2,
  hasDamagedOutcome: false,
  hasLostOutcome: false,
  createdAt: '2026-07-15T09:00:00.000Z',
  updatedAt: '2026-07-15T09:00:00.000Z',
  materialNames: ['Core switch'],
} as const;

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function problem(status = 401): Response {
  return json(
    {
      type: 'about:blank',
      title: 'Sign in required',
      status,
      detail: 'Sign in to continue.',
      code: 'AUTH_REQUIRED',
      requestId: 'test-request-id',
    },
    status,
  );
}

describe('AssetDesk application routes', () => {
  beforeEach(() => {
    resetApiClientState();
    window.history.replaceState({}, '', '/dashboard');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = 'ad_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('renders real operational counts and actions on the Admin dashboard', async () => {
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) {
        return Promise.resolve(json({ data: { user: admin } }));
      }
      if (path.includes('/api/v1/dashboard/admin')) {
        return Promise.resolve(
          json({
            data: {
              stats: {
                todayIssued: 4,
                totalIssues: 81,
                pendingReturns: 12,
                overdueReturns: 3,
                dueToday: 2,
                returnedToday: 5,
                outstandingItems: 19,
                activeWorkers: 7,
              },
              attentionIssues: [issueSummary],
              recentIssues: [issueSummary],
              generatedAt: '2026-07-16T09:30:00.000Z',
            },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Good to see you, Anita Sharma' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Issued today: 4' })).toHaveAttribute(
      'href',
      '/issues?period=TODAY',
    );
    expect(screen.getByRole('link', { name: 'Overdue: 3' })).toHaveAttribute('href', '/overdue');
    expect(screen.getAllByRole('link', { name: 'Audit logs' })[0]).toHaveAttribute(
      'href',
      '/audit',
    );
    expect(screen.getAllByRole('link', { name: 'Reports' })[0]).toHaveAttribute('href', '/reports');
    expect(screen.getByText('19 material items outside')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.queryByText('anita.sharma@university.edu')).not.toBeInTheDocument();
  });

  it('forces an invited Worker to create a password before the app shell opens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: { user: worker } })));

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Create a new password' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('shows the signed-out login form when session recovery fails', async () => {
    window.history.replaceState({}, '', '/login');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem()));

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Sign in to AssetDesk' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Worker ID or Admin email')).toHaveAttribute(
      'autocomplete',
      'username',
    );
  });

  it('lazy-loads the real Worker list for an Admin', async () => {
    window.history.replaceState({}, '', '/workers');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/workers?')) {
        return Promise.resolve(
          json({
            data: [
              {
                id: 'worker-user-id',
                workerId: 'GEU-WRK-B8M5',
                name: 'Ravi Mehta',
                email: 'ravi.mehta@university.edu',
                contact: null,
                department: 'Server Operations',
                status: 'INVITED',
                invitationStatus: 'PENDING',
                mustChangePassword: true,
                temporaryPasswordExpiresAt: '2026-07-16T09:00:00.000Z',
                lastLoginAt: null,
                createdAt: '2026-07-15T09:00:00.000Z',
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findAllByText('Ravi Mehta')).not.toHaveLength(0);
    expect(
      screen.getAllByRole('link', { name: /view worker details|view details/i }).length,
    ).toBeGreaterThan(0);
  });

  it('validates the login form without blocking password paste support', async () => {
    window.history.replaceState({}, '', '/login');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(problem()));
    render(<App />);

    const button = await screen.findByRole('button', { name: 'Sign in' });
    fireEvent.click(button);
    expect(
      screen.getByText('Enter your Worker ID or Admin email and password.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('onpaste');
  });

  it('keeps legacy Inventory records readable without material creation actions', async () => {
    window.history.replaceState({}, '', '/inventory');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/inventory?')) {
        return Promise.resolve(
          json({
            data: [
              {
                id: 'material-id',
                materialCode: 'GEU-MAT-000241',
                name: 'Core switch',
                category: 'Network devices',
                description: 'Server room core switch',
                trackingMode: 'SERIALIZED',
                returnPolicy: 'REUSABLE',
                status: 'ACTIVE',
                totalQuantity: 2,
                availableQuantity: 1,
                issuedQuantity: 1,
                unitLabel: null,
                createdAt: '2026-07-15T09:00:00.000Z',
                updatedAt: '2026-07-15T09:00:00.000Z',
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect((await screen.findAllByText('Core switch')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Add material' })).not.toBeInTheDocument();
    expect(screen.getAllByText('1 of 2 units available').length).toBeGreaterThan(0);
  });

  it('gives Workers read-only Inventory access', async () => {
    window.history.replaceState({}, '', '/inventory');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) {
        return Promise.resolve(json({ data: { user: activeWorker } }));
      }
      if (path.includes('/api/v1/inventory?')) {
        return Promise.resolve(
          json({
            data: [],
            meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'No material added' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add material' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument();
  });

  it('renders the Receiver directory for a Worker without management controls', async () => {
    window.history.replaceState({}, '', '/receivers');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) {
        return Promise.resolve(json({ data: { user: activeWorker } }));
      }
      if (path.includes('/api/v1/receivers?')) {
        return Promise.resolve(
          json({
            data: [
              {
                id: 'receiver-id',
                receiverCode: 'GEU-RCV-000125',
                fullName: 'Neha Verma',
                universityId: 'FAC-112',
                type: 'FACULTY',
                department: 'Computer Science',
                contact: '9876543210',
                email: 'neha.verma@university.edu',
                status: 'ACTIVE',
                createdAt: '2026-07-15T09:00:00.000Z',
                updatedAt: '2026-07-15T09:00:00.000Z',
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect((await screen.findAllByText('Neha Verma')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Add receiver' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Receivers' }).length).toBeGreaterThan(0);
  });

  it('parses and renders the Admin Issue Record list', async () => {
    window.history.replaceState({}, '', '/issues');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/issues?')) {
        return Promise.resolve(
          json({
            data: [issueSummary],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect((await screen.findAllByText('GEU-ISS-2026-000123')).length).toBeGreaterThan(0);
    expect(screen.getByText('Review all university Issue Records.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Record Return' }).length).toBeGreaterThan(0);
  });

  it('allows a Worker to open the Issue material workflow', async () => {
    window.history.replaceState({}, '', '/issues/new');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: { user: activeWorker } })));

    render(<App />);

    expect(await screen.findByText('Person receiving material')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Issue material' })).toBeInTheDocument();
    expect(screen.getByText(/No inventory setup is required/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Access denied' })).not.toBeInTheDocument();
  });

  it('allows a Worker to search Returns and view scoped activity', async () => {
    window.history.replaceState({}, '', '/returns');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) {
        return Promise.resolve(json({ data: { user: activeWorker } }));
      }
      if (path.includes('/api/v1/returns?')) {
        return Promise.resolve(
          json({ data: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Find Issue Record' })).toBeInTheDocument();
    const lookup = screen.getByLabelText('Find an Issue Record to Return');
    expect(lookup).toBeInTheDocument();
    fireEvent.change(lookup, { target: { value: 'receiver name' } });
    fireEvent.submit(lookup.closest('form') as HTMLFormElement);
    expect(await screen.findByText(/enter a complete Issue ID or asset tag/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/api/v1/issues/return-search'),
      ),
    ).toBe(false);
    expect(await screen.findByRole('heading', { name: 'No Returns recorded' })).toBeInTheDocument();
  });

  it('renders overdue records and asks an Admin to confirm a Return reminder', async () => {
    window.history.replaceState({}, '', '/overdue');
    const fetchMock = vi.fn((input: string | URL | Request, _init?: RequestInit) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/overdue?')) {
        return Promise.resolve(
          json({
            data: [
              {
                ...issueSummary,
                expectedReturnAt: '2026-07-10T09:00:00.000Z',
                overdueMinutes: 8_640,
                reminderCount: 0,
                lastReminderAt: null,
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Overdue Returns' }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('GEU-ISS-2026-000123')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send reminder' }));
    expect(screen.getByRole('heading', { name: 'Send Return reminder?' })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).includes('/reminders') &&
          (init as RequestInit | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('renders immutable audit evidence for an Admin', async () => {
    window.history.replaceState({}, '', '/audit?from=2026-07-01&to=2026-07-16');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/audit-events?')) {
        return Promise.resolve(
          json({
            data: [
              {
                id: 'audit-event-id',
                timestampUtc: '2026-07-16T09:30:00.000Z',
                requestId: 'request-id',
                actorWorkerId: 'GEU-WRK-A7K4',
                actorRole: 'ADMIN',
                action: 'RETURN_REMINDER_SENT',
                targetType: 'ISSUE',
                targetId: 'GEU-ISS-2026-000123',
                result: 'SUCCESS',
                reasonCode: null,
                metadata: { reminderCount: 1 },
              },
            ],
            meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Audit logs' }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Return Reminder Sent')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('GEU-ISS-2026-000123')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Success').length).toBeGreaterThan(0);
  });

  it('renders the non-financial Issue Register report for an Admin', async () => {
    window.history.replaceState({}, '', '/reports?issuedFrom=2026-07-01&issuedThrough=2026-07-16');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);
      if (path.includes('/api/v1/auth/me')) return Promise.resolve(json({ data: { user: admin } }));
      if (path.includes('/api/v1/reports/issue-register?')) {
        return Promise.resolve(
          json({
            data: [
              {
                issueId: 'GEU-ISS-2026-000123',
                status: 'ISSUED',
                issuedAt: '2026-07-15T09:00:00.000Z',
                expectedReturnAt: '2026-07-22T09:00:00.000Z',
                receiverName: 'Neha Verma',
                receiverType: 'FACULTY',
                department: 'Computer Science',
                issuedByWorkerId: 'GEU-WRK-A7K4',
                issuedByName: 'Anita Sharma',
                materials: ['Core switch'],
                totalIssuedQuantity: 2,
                totalOutstandingQuantity: 2,
                returnEventCount: 0,
              },
            ],
            meta: {
              page: 1,
              pageSize: 20,
              total: 1,
              totalPages: 1,
              generatedAt: '2026-07-16T09:30:00.000Z',
              timezone: 'Asia/Kolkata',
            },
          }),
        );
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Issue Register' })).toBeInTheDocument();
    expect(
      screen.getByText('No prices, fines, payments or financial fields are included.'),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('GEU-ISS-2026-000123')).length).toBeGreaterThan(0);
  });

  it('keeps Phase 7 operational pages Admin-only', async () => {
    window.history.replaceState({}, '', '/audit');
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input).includes('/api/v1/auth/me')) {
        return Promise.resolve(json({ data: { user: activeWorker } }));
      }
      return Promise.resolve(problem(404));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Access denied' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('link', { name: 'Audit logs' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports' })).not.toBeInTheDocument();
  });
});
