import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Loading } from './components/ui';

import Marketing from './pages/Marketing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { PrivacyPolicy, DataDeletion } from './pages/Legal';
import SsoCallback from './pages/SsoCallback';
import Dashboard from './pages/Dashboard';
import Reports from './pages/Reports';
import Leads from './pages/Leads';
import LeadDetail from './pages/LeadDetail';
import Contacts from './pages/Contacts';
import Customer360 from './pages/Customer360';
import Pipeline from './pages/Pipeline';
import DealDetail from './pages/DealDetail';
import Tasks from './pages/Tasks';
import Inbox from './pages/Inbox';
import Simulator from './pages/Simulator';
import Team from './pages/Team';
import Billing from './pages/Billing';
import Integrations from './pages/Integrations';
import Workflows from './pages/Workflows';
import ApiDocs from './pages/ApiDocs';
import AuditLog from './pages/AuditLog';
import AdminOrgs from './pages/AdminOrgs';
import AdminOrgDetail from './pages/AdminOrgDetail';

function Protected({ children, superAdmin = false }: { children: JSX.Element; superAdmin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (superAdmin && !user.isSuperAdmin) return <Navigate to="/app" replace />;
  return children;
}

function AppRoute({ children, superAdmin = false }: { children: JSX.Element; superAdmin?: boolean }) {
  return (
    <Protected superAdmin={superAdmin}>
      <Layout>{children}</Layout>
    </Protected>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Marketing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/data-deletion" element={<DataDeletion />} />
      <Route path="/sso-callback" element={<SsoCallback />} />

      <Route path="/app" element={<AppRoute><Dashboard /></AppRoute>} />
      <Route path="/app/reports" element={<AppRoute><Reports /></AppRoute>} />
      <Route path="/app/leads" element={<AppRoute><Leads /></AppRoute>} />
      <Route path="/app/leads/:id" element={<AppRoute><LeadDetail /></AppRoute>} />
      <Route path="/app/contacts" element={<AppRoute><Contacts /></AppRoute>} />
      <Route path="/app/contacts/:id" element={<AppRoute><Customer360 /></AppRoute>} />
      <Route path="/app/pipeline" element={<AppRoute><Pipeline /></AppRoute>} />
      <Route path="/app/deals/:id" element={<AppRoute><DealDetail /></AppRoute>} />
      <Route path="/app/tasks" element={<AppRoute><Tasks /></AppRoute>} />
      <Route path="/app/inbox" element={<AppRoute><Inbox /></AppRoute>} />
      <Route path="/app/simulator" element={<AppRoute><Simulator /></AppRoute>} />
      <Route path="/app/team" element={<AppRoute><Team /></AppRoute>} />
      <Route path="/app/billing" element={<AppRoute><Billing /></AppRoute>} />
      <Route path="/app/integrations" element={<AppRoute><Integrations /></AppRoute>} />
      <Route path="/app/workflows" element={<AppRoute><Workflows /></AppRoute>} />
      <Route path="/app/api-docs" element={<AppRoute><ApiDocs /></AppRoute>} />
      <Route path="/app/audit" element={<AppRoute><AuditLog /></AppRoute>} />

      <Route path="/admin" element={<AppRoute superAdmin><AdminOrgs /></AppRoute>} />
      <Route path="/admin/organizations/:id" element={<AppRoute superAdmin><AdminOrgDetail /></AppRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
