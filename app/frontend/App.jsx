import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import WizardPage from './pages/WizardPage';
import ReportPage from './pages/ReportPage';
import DashboardPage from './pages/DashboardPage';
import ConsultantPage from './pages/ConsultantPage';
import LoginPage from './pages/LoginPage';
import AdminSignupPage from './pages/AdminSignupPage';
import ProfilePage from './pages/ProfilePage';
import ResourcesPage from './pages/ResourcesPage';
import TokenUsagePage from './pages/TokenUsagePage';
import DatabaseManagementPage from './pages/DatabaseManagementPage';
import StaffDashboard from './pages/StaffDashboard';
import AdminDashboard from './pages/AdminDashboard';
import PricingPage from './pages/PricingPage';
import MajorDetailPage from './pages/MajorDetailPage';
import AuthenticatedLayout from './layouts/AuthenticatedLayout';
import { AuthProvider, useAuth } from './context/AuthContext'; // Import AuthProvider and useAuth hook
import { LanguageProvider } from './context/LanguageContext';
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

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
      <LanguageProvider>
        <AuthProvider>
          <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-signup" element={<AdminSignupPage />} />
          <Route path="/wizard" element={<ProtectedRoute><WizardPage /></ProtectedRoute>} />

          {/* Protected Routes sharing sidebar and navigation */}
          <Route element={<AuthenticatedLayout />}>
          {/* All routes within AuthenticatedLayout will have access to AuthContext */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/consultant" element={<ConsultantPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/majors/:majorId" element={<MajorDetailPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/system/tokens" element={<TokenUsagePage />} />
          <Route path="/staff" element={<StaffRoute><StaffDashboard /></StaffRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/system/database" element={<AdminRoute><DatabaseManagementPage /></AdminRoute>} />
        </Route>
          </Routes>
        </AuthProvider>
      </LanguageProvider>
    </div>
  );
}

export default App;
