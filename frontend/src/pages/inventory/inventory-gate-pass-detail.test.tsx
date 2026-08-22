import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  cancelInventoryGatePass: vi.fn(),
  getInventoryGatePass: vi.fn(),
  getInventoryGatePasses: vi.fn(),
  recordInventoryGateIn: vi.fn(),
  recordInventoryGateOut: vi.fn(),
  updateInventoryGatePass: vi.fn(),
}));

vi.mock('../../lib/inventory-gate-pass-api', () => api);
vi.mock('../../auth/auth-context', () => ({
  useAuth: () => ({
    user: { role: 'ADMIN', permissions: [] },
    status: 'authenticated',
  }),
}));

import { InventoryGatePassDetailPage } from './inventory-gate-pass-pages';

const pass = {
  id: 'pass-id',
  gatePassNumber: 'GEU-GP-2026-000001',
  source: 'MANUAL',
  purpose: 'OTHER',
  issueId: null,
  materialComposition: 'CONSUMABLE_ONLY',
  status: 'OUTSIDE',
  destination: { name: 'External Lab' },
  carrier: { name: 'Amit Kumar' },
  items: [
    {
      itemId: 'd03dfe35-0e97-4823-9c74-d68448e051ad',
      materialId: 'material-id',
      materialCode: 'GEU-MAT-2026-000001',
      materialName: 'Network Cable',
      category: 'Networking',
      model: null,
      trackingMode: 'QUANTITY',
      returnRequirement: 'RETURNABLE',
      assetUnitId: null,
      assetTag: null,
      serialNumber: null,
      quantity: 5,
      unitLabel: 'pieces',
      conditionOut: 'Packed and sealed',
      movementCondition: null,
      faultDescription: null,
      receivedQuantity: 0,
      remainingOutsideQuantity: 5,
    },
  ],
  expectedGateInAt: null,
  remarks: null,
  createdBy: { userId: 'admin-id', workerId: 'GEU-WRK-ADMIN', name: 'Admin', role: 'ADMIN' },
  gateOut: {
    at: '2026-08-22T05:30:00.000Z',
    by: { userId: 'admin-id', workerId: 'GEU-WRK-ADMIN', name: 'Admin', role: 'ADMIN' },
  },
  gateInEvents: [],
  createdAt: '2026-08-22T05:00:00.000Z',
  updatedAt: '2026-08-22T05:30:00.000Z',
} as const;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inventory/gate-passes/GEU-GP-2026-000001']}>
        <Routes>
          <Route
            element={<InventoryGatePassDetailPage />}
            path="/inventory/gate-passes/:gatePassNumber"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Inventory Gate Pass detail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getInventoryGatePass.mockResolvedValue(pass);
    api.recordInventoryGateIn.mockResolvedValue({ ...pass, status: 'PARTIALLY_IN' });
  });

  it('records a validated partial Gate In with condition and outcome', async () => {
    renderPage();

    fireEvent.click(
      await screen.findByRole('checkbox', { name: /Select Network Cable for Gate In/ }),
    );
    fireEvent.change(screen.getByLabelText('Receiving quantity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Condition received'), {
      target: { value: 'Two pieces received intact' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record selected Gate In' }));

    await waitFor(() =>
      expect(api.recordInventoryGateIn).toHaveBeenCalledWith('GEU-GP-2026-000001', {
        items: [
          {
            itemId: 'd03dfe35-0e97-4823-9c74-d68448e051ad',
            quantity: 2,
            condition: 'Two pieces received intact',
            outcome: 'RECEIVED',
          },
        ],
      }),
    );
  });
});
