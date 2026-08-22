import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createInventoryGatePass: vi.fn(),
  getInventoryGatePassAssetOptions: vi.fn(),
  getInventoryGatePassMaterialOptions: vi.fn(),
}));

vi.mock('../../lib/inventory-gate-pass-api', () => api);

import { CreateInventoryGatePassPage } from './create-inventory-gate-pass-page';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateInventoryGatePassPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Create Inventory Gate Pass page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getInventoryGatePassMaterialOptions.mockResolvedValue({
      data: [
        {
          materialCode: 'GEU-MAT-2026-000001',
          name: 'Dell Latitude 5450',
          category: 'Laptop',
          model: 'Latitude 5450',
          trackingMode: 'SERIALIZED',
          returnPolicy: 'REUSABLE',
          availableQuantity: 0,
          totalQuantity: 1,
          unitLabel: null,
        },
      ],
      meta: { page: 1, pageSize: 20, total: 1, totalPages: 1, categories: ['Laptop'] },
    });
    api.getInventoryGatePassAssetOptions.mockResolvedValue({
      data: [
        {
          assetTag: 'GEU-AST-2026-000001',
          serialNumber: 'SN-DELL-001',
          condition: 'Good',
          status: 'AVAILABLE',
        },
        {
          assetTag: 'GEU-AST-2026-000002',
          serialNumber: 'SN-DELL-002',
          condition: 'Good',
          status: 'AVAILABLE',
        },
      ],
      meta: { total: 2 },
    });
  });

  it('shows explicit material types and server-backed category filtering', async () => {
    renderPage();

    expect(screen.getByRole('button', { name: /IT Asset/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /IT Consumable/ }));

    await waitFor(() =>
      expect(api.getInventoryGatePassMaterialOptions).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20, trackingMode: 'QUANTITY' }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('classifies and adds multiple available assets in one action', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Dell Latitude 5450/ }));
    await screen.findByRole('checkbox', { name: /GEU-AST-2026-000001/ });
    fireEvent.click(await screen.findByRole('button', { name: 'Select visible' }));
    fireEvent.change(screen.getByRole('combobox', { name: /Condition \/ reason/ }), {
      target: { value: 'FAULTY' },
    });

    const addButton = screen.getByRole('button', { name: /Add 2 assets/ });
    expect(addButton).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Briefly describe the fault/), {
      target: { value: 'Replace faulty display cable' },
    });
    expect(addButton).toBeEnabled();
    fireEvent.click(addButton);

    expect(screen.getAllByText('Dell Latitude 5450').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('GEU-AST-2026-000001')).toHaveLength(2);
    expect(screen.getAllByText('GEU-AST-2026-000002')).toHaveLength(2);
    expect(screen.getAllByText('Faulty').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Replace faulty display cable')).toHaveLength(2);
  });

  it('provides quantity controls before and after adding a consumable', async () => {
    api.getInventoryGatePassMaterialOptions.mockImplementation((filters) =>
      Promise.resolve(
        filters.trackingMode === 'QUANTITY'
          ? {
              data: [
                {
                  materialCode: 'GEU-MAT-2026-000010',
                  name: 'HDMI Cable',
                  category: 'Cable',
                  model: null,
                  trackingMode: 'QUANTITY',
                  returnPolicy: 'CONSUMABLE',
                  availableQuantity: 10,
                  totalQuantity: 10,
                  unitLabel: 'pieces',
                },
              ],
              meta: {
                page: 1,
                pageSize: 20,
                total: 1,
                totalPages: 1,
                categories: ['Cable'],
              },
            }
          : {
              data: [],
              meta: { page: 1, pageSize: 20, total: 0, totalPages: 0, categories: [] },
            },
      ),
    );
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /IT Consumables/ }));
    fireEvent.click(await screen.findByRole('button', { name: /HDMI Cable/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(screen.getByRole('spinbutton', { name: 'Material quantity' })).toHaveValue(2);
    fireEvent.change(screen.getByPlaceholderText(/Briefly describe the fault/), {
      target: { value: 'Connector replacement required' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add 2 pieces/ }));

    const addedQuantity = screen.getByRole('spinbutton', { name: 'HDMI Cable quantity' });
    expect(addedQuantity).toHaveValue(2);
    fireEvent.click(screen.getByRole('button', { name: 'Increase HDMI Cable quantity' }));
    expect(addedQuantity).toHaveValue(3);
  });
});
