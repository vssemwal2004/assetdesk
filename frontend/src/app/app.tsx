import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AuthProvider } from '../auth/auth-context';
import {
  AdminRoute,
  InitialPasswordRoute,
  PermissionRoute,
  ProtectedRoute,
  PublicOnlyRoute,
} from '../auth/route-guards';
import { AppShell } from '../components/app-shell';
import { LoadingPanel } from '../components/ui';
import { AccessDeniedPage } from '../pages/access-denied-page';
import { ChangeInitialPasswordPage } from '../pages/change-initial-password-page';
import { ChangePasswordPage } from '../pages/change-password-page';
import { DashboardPage } from '../pages/dashboard-page';
import { LoginPage } from '../pages/login-page';
import { ProfilePage } from '../pages/profile-page';
import { CartridgeDashboardPage } from '../pages/cartridges/cartridge-dashboard-page';
import { CartridgesPage } from '../pages/cartridges/cartridges-page';
import { AddCartridgesPage } from '../pages/cartridges/add-cartridges-page';
import {
  IssueCartridgePage,
  ReturnCartridgePage,
} from '../pages/cartridges/cartridge-operation-page';
import {
  CreateGatePassPage,
  GatePassDetailPage,
  GatePassesPage,
  GatePassPrintPage,
} from '../pages/cartridges/gate-passes-page';
import { CartridgeDetailPage } from '../pages/cartridges/cartridge-detail-page';
import { CartridgeQcPage } from '../pages/cartridges/cartridge-qc-page';

const WorkersPage = lazy(() =>
  import('../pages/workers/workers-page').then((module) => ({ default: module.WorkersPage })),
);
const CreateWorkerPage = lazy(() =>
  import('../pages/workers/create-worker-page').then((module) => ({
    default: module.CreateWorkerPage,
  })),
);
const WorkerImportPage = lazy(() =>
  import('../pages/workers/worker-import-page').then((module) => ({
    default: module.WorkerImportPage,
  })),
);
const WorkerDetailPage = lazy(() =>
  import('../pages/workers/worker-detail-page').then((module) => ({
    default: module.WorkerDetailPage,
  })),
);
const InventoryPage = lazy(() =>
  import('../pages/inventory/inventory-page').then((module) => ({
    default: module.InventoryPage,
  })),
);
const InventoryDetailPage = lazy(() =>
  import('../pages/inventory/inventory-detail-page').then((module) => ({
    default: module.InventoryDetailPage,
  })),
);
const CreateMaterialPage = lazy(() =>
  import('../pages/inventory/create-material-page').then((module) => ({
    default: module.CreateMaterialPage,
  })),
);
const InventoryImportPage = lazy(() =>
  import('../pages/inventory/inventory-import-page').then((module) => ({
    default: module.InventoryImportPage,
  })),
);
const InventoryImportReviewPage = lazy(() =>
  import('../pages/inventory/inventory-import-review-page').then((module) => ({
    default: module.InventoryImportReviewPage,
  })),
);
const AssetTypePage = lazy(() =>
  import('../pages/inventory/asset-type-page').then((module) => ({
    default: module.AssetTypePage,
  })),
);
const ReceiversPage = lazy(() =>
  import('../pages/receivers/receivers-page').then((module) => ({
    default: module.ReceiversPage,
  })),
);
const CreateReceiverPage = lazy(() =>
  import('../pages/receivers/create-receiver-page').then((module) => ({
    default: module.CreateReceiverPage,
  })),
);
const ReceiverDetailPage = lazy(() =>
  import('../pages/receivers/receiver-detail-page').then((module) => ({
    default: module.ReceiverDetailPage,
  })),
);
const IssuesPage = lazy(() =>
  import('../pages/issues/issues-page').then((module) => ({ default: module.IssuesPage })),
);
const CreateIssuePage = lazy(() =>
  import('../pages/issues/create-issue-page').then((module) => ({
    default: module.CreateIssuePage,
  })),
);
const IssueDetailPage = lazy(() =>
  import('../pages/issues/issue-detail-page').then((module) => ({
    default: module.IssueDetailPage,
  })),
);
const ReturnIssuePage = lazy(() =>
  import('../pages/issues/return-issue-page').then((module) => ({
    default: module.ReturnIssuePage,
  })),
);
const ReturnsPage = lazy(() =>
  import('../pages/issues/returns-page').then((module) => ({ default: module.ReturnsPage })),
);
const OverdueAssetsPage = lazy(() =>
  import('../pages/issues/overdue-assets-page').then((module) => ({
    default: module.OverdueAssetsPage,
  })),
);
const BillsPage = lazy(() =>
  import('../pages/bills/bills-page').then((module) => ({ default: module.BillsPage })),
);
const BillPage = lazy(() =>
  import('../pages/bills/bill-page').then((module) => ({ default: module.BillPage })),
);
const AuditPage = lazy(() =>
  import('../pages/audit/audit-page').then((module) => ({ default: module.AuditPage })),
);
const ReportsPage = lazy(() =>
  import('../pages/reports/reports-page').then((module) => ({ default: module.ReportsPage })),
);

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}

function FeatureRouteFallback() {
  return <LoadingPanel label="Loading page" />;
}

export function App() {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route element={<LoginPage />} path="/login" />
            </Route>

            <Route element={<InitialPasswordRoute />}>
              <Route element={<ChangeInitialPasswordPage />} path="/change-initial-password" />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route element={<DashboardPage />} path="/dashboard" />
                <Route element={<PermissionRoute permission="CARTRIDGES_VIEW" />}>
                  <Route element={<CartridgeDashboardPage />} path="/cartridges/dashboard" />
                  <Route element={<CartridgesPage />} path="/cartridges" />
                  <Route element={<GatePassesPage />} path="/cartridges/gate-passes" />
                  <Route
                    element={<GatePassDetailPage />}
                    path="/cartridges/gate-passes/:gatePassId"
                  />
                  <Route
                    element={<GatePassPrintPage />}
                    path="/cartridges/gate-passes/:gatePassId/print"
                  />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGES_ADD" />}>
                  <Route element={<AddCartridgesPage />} path="/cartridges/new" />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGES_ISSUE" />}>
                  <Route element={<IssueCartridgePage />} path="/cartridges/issues/new" />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGES_RETURN" />}>
                  <Route element={<ReturnCartridgePage />} path="/cartridges/returns/new" />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGE_QC" />}>
                  <Route element={<CartridgeQcPage />} path="/cartridges/gate-in" />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGE_GATE_PASSES_CREATE" />}>
                  <Route element={<CreateGatePassPage />} path="/cartridges/gate-passes/new" />
                </Route>
                <Route element={<PermissionRoute permission="CARTRIDGES_VIEW" />}>
                  <Route element={<CartridgeDetailPage />} path="/cartridges/:serialNumber" />
                </Route>
                <Route element={<ProfilePage />} path="/profile" />
                <Route element={<ChangePasswordPage />} path="/profile/change-password" />
                <Route element={<AccessDeniedPage />} path="/access-denied" />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <IssuesPage />
                    </Suspense>
                  }
                  path="/issues"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <CreateIssuePage />
                    </Suspense>
                  }
                  path="/issues/new"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <ReturnIssuePage />
                    </Suspense>
                  }
                  path="/issues/:issueId/return"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <IssueDetailPage />
                    </Suspense>
                  }
                  path="/issues/:issueId"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <ReturnsPage />
                    </Suspense>
                  }
                  path="/returns"
                />
                <Route element={<AdminRoute />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <OverdueAssetsPage />
                      </Suspense>
                    }
                    path="/overdue"
                  />
                </Route>
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <BillsPage />
                    </Suspense>
                  }
                  path="/bills"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <BillPage />
                    </Suspense>
                  }
                  path="/bills/:issueId"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <InventoryPage />
                    </Suspense>
                  }
                  path="/inventory"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <ReceiversPage />
                    </Suspense>
                  }
                  path="/receivers"
                />
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <ReceiverDetailPage />
                    </Suspense>
                  }
                  path="/receivers/:receiverCode"
                />
                <Route element={<AdminRoute />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <AuditPage />
                      </Suspense>
                    }
                    path="/audit"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <ReportsPage />
                      </Suspense>
                    }
                    path="/reports"
                  />
                </Route>
                <Route element={<PermissionRoute permission="RECEIVERS_ADD" />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <CreateReceiverPage />
                      </Suspense>
                    }
                    path="/receivers/new"
                  />
                </Route>
                <Route element={<PermissionRoute permission="INVENTORY_ADD" />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <CreateMaterialPage />
                      </Suspense>
                    }
                    path="/inventory/new"
                  />
                </Route>
                <Route element={<PermissionRoute permission="INVENTORY_IMPORT" />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <InventoryImportPage />
                      </Suspense>
                    }
                    path="/inventory/import"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <InventoryImportReviewPage />
                      </Suspense>
                    }
                    path="/inventory/import/:importId/review"
                  />
                </Route>
                <Route element={<PermissionRoute permission="ASSET_TYPES_MANAGE" />}>
                  <Route
                    element={<Navigate replace to="/inventory/asset-types/add" />}
                    path="/inventory/asset-types"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <AssetTypePage />
                      </Suspense>
                    }
                    path="/inventory/asset-types/add"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <AssetTypePage />
                      </Suspense>
                    }
                    path="/inventory/asset-types/view"
                  />
                </Route>
                <Route element={<AdminRoute />}>
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <WorkersPage />
                      </Suspense>
                    }
                    path="/workers"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <CreateWorkerPage />
                      </Suspense>
                    }
                    path="/workers/new"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <WorkerImportPage />
                      </Suspense>
                    }
                    path="/workers/import"
                  />
                  <Route
                    element={
                      <Suspense fallback={<FeatureRouteFallback />}>
                        <WorkerDetailPage />
                      </Suspense>
                    }
                    path="/workers/:workerId"
                  />
                </Route>
                <Route
                  element={
                    <Suspense fallback={<FeatureRouteFallback />}>
                      <InventoryDetailPage />
                    </Suspense>
                  }
                  path="/inventory/:materialCode"
                />
              </Route>
            </Route>

            <Route element={<Navigate replace to="/dashboard" />} path="/" />
            <Route element={<Navigate replace to="/dashboard" />} path="*" />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
