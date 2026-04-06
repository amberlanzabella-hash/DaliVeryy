import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, UserRole } from '@/store/authStore';

// Route guard that blocks guests and redirects users to the correct page.
export default function RequireAuth({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: UserRole;
}) {
  const location = useLocation();
  const { isAuthenticated, role: currentRole } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (role && currentRole !== role) {
    // Logged in but wrong role -> send them to their proper landing page
    return <Navigate to={currentRole === 'admin' ? '/admin' : '/home'} replace />;
  }

  return <>{children}</>;
}
