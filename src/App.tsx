import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import IplPage from "@/pages/Ipl";
import ResidentsPage from "@/pages/Residents";
import EnvironmentPage from "@/pages/Environment";
import ShiftsPage from "@/pages/Shifts";
import NotificationsPage from "@/pages/Notifications";
import AccountPage from "@/pages/Account";
import AccountPasswordPage from "@/pages/AccountPassword";
import ResetPasswordPage from "@/pages/ResetPassword";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route
          path="/ipl"
          element={
            <ProtectedRoute allowedRoles={["admin", "pengurus", "penghuni"]}>
              <IplPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/residents"
          element={
            <ProtectedRoute allowedRoles={["admin", "pengurus"]}>
              <ResidentsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/environment" element={<EnvironmentPage />} />
        <Route
          path="/shifts"
          element={
            <ProtectedRoute allowedRoles={["admin", "pengurus", "satpam"]}>
              <ShiftsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/password" element={<AccountPasswordPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
