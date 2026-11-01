import { Outlet } from 'react-router-dom';
import { Suspense } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import { PageLoader } from '../ui';

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
      </main>
      <Footer />
    </div>
  );
}
