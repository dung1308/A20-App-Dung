import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WizardPage from './pages/WizardPage';
import ReportPage from './pages/ReportPage';
import DashboardPage from './pages/DashboardPage';
import ConsultantPage from './pages/ConsultantPage';
import LoginPage from './pages/LoginPage';
import ProfilePage from './pages/ProfilePage';
import TokenUsagePage from './pages/TokenUsagePage';
import DatabaseManagementPage from './pages/DatabaseManagementPage';
import StaffDashboard from './pages/StaffDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PricingPage from './pages/PricingPage';
import AuthenticatedLayout from './layouts/AuthenticatedLayout';
import { AuthProvider, useAuth } from './context/AuthContext'; // Import AuthProvider and useAuth hook
import { Toaster } from 'react-hot-toast';

const AdminRoute = ({ children }) => {
  const { role, isAuthenticated, loading } = useAuth();
  // While auth state is initializing, don't redirect
  if (loading) return null;
  if (!isAuthenticated || role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

const StaffRoute = ({ children }) => {
  const { role, isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated || (role !== 'admin' && role !== 'editor')) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

function App() {
  return (
    <div className="app-container">
      <Toaster 
        position="top-right" 
        reverseOrder={false} 
        toastOptions={{
          // Default options for all toasts
          className: '',
          duration: 3000,
          style: {
            background: '#fff',
            color: '#0d1c2e',
            fontSize: '14px',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          },
          // Options for specific types of toasts
          success: {
            iconTheme: {
              primary: '#003466', // Trustworthy Blue
              secondary: '#fff',
            },
          },
        }} />
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/wizard" element={<WizardPage />} />

          {/* Protected Routes sharing sidebar and navigation */}
          <Route element={<AuthenticatedLayout />}>
          {/* All routes within AuthenticatedLayout will have access to AuthContext */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/consultant" element={<ConsultantPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/system/tokens" element={<TokenUsagePage />} />
          <Route path="/staff" element={<StaffRoute><StaffDashboard /></StaffRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/system/database" element={<DatabaseManagementPage />} />
        </Route>
        </Routes>
      </AuthProvider>
    </div>
  );
}

export default App;