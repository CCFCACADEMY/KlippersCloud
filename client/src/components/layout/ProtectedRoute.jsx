import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from '../../context/AuthContext';
import { PageLoader } from '../ui';

/** Route guard: requires login and (optionally) one of `roles`. */
export default function ProtectedRoute({ roles }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <PageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
