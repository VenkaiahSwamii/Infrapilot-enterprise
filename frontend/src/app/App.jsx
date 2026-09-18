import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardStoreProvider } from '../store/dashboardStore.jsx';
import { ServerStoreProvider } from '../store/serverStore.jsx';
import { AlertStoreProvider } from '../store/alertStore.jsx';
import Layout from '../components/layout/Layout.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import EnterpriseDashboard from '../features/overview/EnterpriseDashboard.jsx';
import MachineDetailPage from '../features/machines/MachineDetailPage.jsx';
import AlertsPage from '../features/alerts/AlertsPage.jsx';
import LogsPage from '../features/logs/LogsPage.jsx';
import DeployPage from '../features/deploy/DeployPage.jsx';

// Custom pages supporting sidebar paths
import DockerPage from '../pages/DockerPage.jsx';
import KubernetesPage from '../pages/KubernetesPage.jsx';
import TerminalPage from '../pages/TerminalPage.jsx';
import LiveMetricsPage from '../pages/LiveMetricsPage.jsx';
import InfrastructurePage from '../pages/InfrastructurePage.jsx';
import UsersPage from '../pages/UsersPage.jsx';
import OrganizationsPage from '../pages/OrganizationsPage.jsx';
import AuditLogsPage from '../pages/AuditLogsPage.jsx';
import SettingsPage from '../pages/SettingsPage.jsx';
import AgentsPage from '../pages/AgentsPage.jsx';

import SREOperationsPage from '../features/sre/SREOperationsPage.jsx';
import SREDiskPage from '../features/sre/SREDiskPage.jsx';
import SRECrashPage from '../features/sre/SRECrashPage.jsx';
import SRELatencyPage from '../features/sre/SRELatencyPage.jsx';
import FleetTerminalPage from '../features/logs/FleetTerminalPage.jsx';

// Analytics & Reports
import AnalyticsSuite from '../features/analytics/AnalyticsSuite.jsx';
import Reports from '../features/analytics/Reports.jsx';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <DashboardStoreProvider>
      <ServerStoreProvider>
        <AlertStoreProvider>
          <BrowserRouter>
            <Routes>
              {/* Public route */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Workspace routes wrapped in the global Layout */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Main Sidebar Pages */}
                <Route index element={<EnterpriseDashboard />} />
                <Route path="terminal" element={<FleetTerminalPage />} />
                <Route path="sre-disk" element={<SREDiskPage />} />
                <Route path="sre-crash" element={<SRECrashPage />} />
                <Route path="sre-latency" element={<SRELatencyPage />} />
                <Route path="infrastructure" element={<InfrastructurePage />} />
                <Route path="machines" element={<InfrastructurePage />} />
                <Route path="live-metrics" element={<LiveMetricsPage />} />
                <Route path="metrics" element={<LiveMetricsPage />} />

                {/* Operations & Analytics */}
                <Route path="servers" element={<Navigate to="/" replace />} />
                <Route path="machines/:machineId" element={<MachineDetailPage />} />
                <Route path="docker" element={<DockerPage />} />
                <Route path="kubernetes" element={<KubernetesPage />} />
                <Route path="k8s" element={<KubernetesPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="logs" element={<LogsPage />} />
                <Route path="analytics" element={<AnalyticsSuite />} />
                <Route path="reports" element={<Reports />} />
                <Route path="agents" element={<AgentsPage />} />
                <Route path="sre" element={<SREOperationsPage />} />
                <Route path="cli" element={<TerminalPage />} />
                <Route path="settings" element={<SettingsPage />} />

                {/* Administration Section */}
                <Route path="admin/users" element={<UsersPage />} />
                <Route path="admin/orgs" element={<OrganizationsPage />} />
                <Route path="admin/audit-logs" element={<AuditLogsPage />} />
                <Route path="admin/settings" element={<SettingsPage />} />
                <Route path="deploy" element={<DeployPage />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AlertStoreProvider>
      </ServerStoreProvider>
    </DashboardStoreProvider>
  );
}
