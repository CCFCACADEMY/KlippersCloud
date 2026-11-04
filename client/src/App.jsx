/**
 * Route map. Pages are lazy-loaded so each role only downloads what it uses.
 *  Public/guest  : /, /services, /barbers, /book, /gallery, /queue, /checkin …
 *  Customer      : /dashboard/*
 *  Barber        : /barber/*
 *  Admin         : /admin/*
 */
import { lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import PublicLayout from './components/layout/PublicLayout';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';

const Home = lazy(() => import('./pages/public/Home'));
const Services = lazy(() => import('./pages/public/Services'));
const Barbers = lazy(() => import('./pages/public/Barbers'));
const BarberProfile = lazy(() => import('./pages/public/BarberProfile'));
const Book = lazy(() => import('./pages/public/Book'));
const Availability = lazy(() => import('./pages/public/Availability'));
const Gallery = lazy(() => import('./pages/public/Gallery'));
const Memberships = lazy(() => import('./pages/public/Memberships'));
const GiftCards = lazy(() => import('./pages/public/GiftCards'));
const StyleAdvisor = lazy(() => import('./pages/public/StyleAdvisor'));
const Queue = lazy(() => import('./pages/public/Queue'));
const CheckIn = lazy(() => import('./pages/public/CheckIn'));
const GuestBooking = lazy(() => import('./pages/public/GuestBooking'));
const Login = lazy(() => import('./pages/public/Auth').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/public/Auth').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/public/Auth').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/public/Auth').then((m) => ({ default: m.ResetPassword })));
const NotFound = lazy(() => import('./pages/public/Auth').then((m) => ({ default: m.NotFound })));

const CustomerDashboard = lazy(() => import('./pages/customer/CustomerDashboard'));
const MyAppointments = lazy(() => import('./pages/customer/MyAppointments'));
const Favorites = lazy(() => import('./pages/customer/Favorites'));
const Rewards = lazy(() => import('./pages/customer/Rewards'));
const Profile = lazy(() => import('./pages/customer/Profile'));

const BarberDashboard = lazy(() => import('./pages/barber/BarberDashboard'));
const BarberCalendar = lazy(() => import('./pages/barber/BarberCalendar'));
const BarberSchedule = lazy(() => import('./pages/barber/BarberSchedule'));
const BarberServices = lazy(() => import('./pages/barber/BarberServices'));
const BarberCustomers = lazy(() => import('./pages/barber/BarberCustomers'));
const BarberProfileEdit = lazy(() => import('./pages/barber/BarberProfileEdit'));
const StaffQueue = lazy(() => import('./pages/barber/StaffQueue'));
const StaffReviews = lazy(() => import('./pages/barber/StaffReviews'));

const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAppointments = lazy(() => import('./pages/admin/AdminAppointments'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminBarbers = lazy(() => import('./pages/admin/AdminBarbers'));
const AdminServices = lazy(() => import('./pages/admin/AdminServices'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminCoupons = lazy(() => import('./pages/admin/AdminCoupons'));
const AdminReports = lazy(() => import('./pages/admin/AdminReports'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="services" element={<Services />} />
        <Route path="barbers" element={<Barbers />} />
        <Route path="barbers/:id" element={<BarberProfile />} />
        <Route path="book" element={<Book />} />
        <Route path="availability" element={<Availability />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="memberships" element={<Memberships />} />
        <Route path="gift-cards" element={<GiftCards />} />
        <Route path="style-advisor" element={<StyleAdvisor />} />
        <Route path="queue" element={<Queue />} />
        <Route path="checkin" element={<CheckIn />} />
        <Route path="guest-booking" element={<GuestBooking />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedRoute roles={['customer']} />}>
        <Route path="dashboard" element={<DashboardLayout />}>
          <Route index element={<CustomerDashboard />} />
          <Route path="appointments" element={<MyAppointments />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="rewards" element={<Rewards />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['barber']} />}>
        <Route path="barber" element={<DashboardLayout />}>
          <Route index element={<BarberDashboard />} />
          <Route path="calendar" element={<BarberCalendar />} />
          <Route path="schedule" element={<BarberSchedule />} />
          <Route path="services" element={<BarberServices />} />
          <Route path="customers" element={<BarberCustomers />} />
          <Route path="queue" element={<StaffQueue />} />
          <Route path="reviews" element={<StaffReviews />} />
          <Route path="profile" element={<BarberProfileEdit />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="admin" element={<DashboardLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="appointments" element={<AdminAppointments />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="barbers" element={<AdminBarbers />} />
          <Route path="services" element={<AdminServices />} />
          <Route path="payments" element={<AdminPayments />} />
          <Route path="reviews" element={<StaffReviews />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="queue" element={<StaffQueue />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>
      </Route>
    </Routes>
  );
}
