import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { Loading } from './components/ui';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/Login';
import { More } from './pages/More';

// Each section loads on first visit, keeping the first download small.
const page = lazy;

const Dashboard = page(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const ItemsList = page(() => import('./pages/items/ItemsList').then((m) => ({ default: m.ItemsList })));
const ItemDetail = page(() => import('./pages/items/ItemDetail').then((m) => ({ default: m.ItemDetail })));
const ItemForm = page(() => import('./pages/items/ItemForm').then((m) => ({ default: m.ItemForm })));
const AddService = page(() => import('./pages/work/AddService').then((m) => ({ default: m.AddService })));
const JobsList = page(() => import('./pages/jobs/JobsList').then((m) => ({ default: m.JobsList })));
const JobNew = page(() => import('./pages/jobs/JobNew').then((m) => ({ default: m.JobNew })));
const JobDetail = page(() => import('./pages/jobs/JobDetail').then((m) => ({ default: m.JobDetail })));
const PurchasesList = page(() => import('./pages/purchases/PurchasesList').then((m) => ({ default: m.PurchasesList })));
const PurchaseNew = page(() => import('./pages/purchases/PurchaseNew').then((m) => ({ default: m.PurchaseNew })));
const PurchaseDetail = page(() => import('./pages/purchases/PurchaseDetail').then((m) => ({ default: m.PurchaseDetail })));
const Calculator = page(() => import('./pages/Calculator').then((m) => ({ default: m.Calculator })));
const PartsList = page(() => import('./pages/parts/PartsList').then((m) => ({ default: m.PartsList })));
const PartDetail = page(() => import('./pages/parts/PartDetail').then((m) => ({ default: m.PartDetail })));
const ServicesList = page(() => import('./pages/services/ServicesList').then((m) => ({ default: m.ServicesList })));
const ServiceForm = page(() => import('./pages/services/ServiceForm').then((m) => ({ default: m.ServiceForm })));
const SalesList = page(() => import('./pages/sales/SalesList').then((m) => ({ default: m.SalesList })));
const SaleNew = page(() => import('./pages/sales/SaleNew').then((m) => ({ default: m.SaleNew })));
const SaleDetail = page(() => import('./pages/sales/SaleDetail').then((m) => ({ default: m.SaleDetail })));
const Overheads = page(() => import('./pages/Overheads').then((m) => ({ default: m.Overheads })));
const Settings = page(() => import('./pages/settings/Settings').then((m) => ({ default: m.Settings })));
const Categories = page(() => import('./pages/settings/Categories').then((m) => ({ default: m.Categories })));
const Channels = page(() => import('./pages/settings/Channels').then((m) => ({ default: m.Channels })));

const s = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

// Hash routing: GitHub Pages 404s on deep links, so every route lives after the #.
const router = createHashRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: s(<Dashboard />) },
      { path: 'items', element: s(<ItemsList />) },
      { path: 'items/new', element: s(<ItemForm />) },
      { path: 'items/:id', element: s(<ItemDetail />) },
      { path: 'items/:id/edit', element: s(<ItemForm />) },
      { path: 'items/:id/add-service', element: s(<AddService mode="item" />) },
      { path: 'jobs', element: s(<JobsList />) },
      { path: 'jobs/new', element: s(<JobNew />) },
      { path: 'jobs/:id', element: s(<JobDetail />) },
      { path: 'jobs/:id/add-service', element: s(<AddService mode="job" />) },
      { path: 'purchases', element: s(<PurchasesList />) },
      { path: 'purchases/new', element: s(<PurchaseNew />) },
      { path: 'purchases/:id', element: s(<PurchaseDetail />) },
      { path: 'calculator', element: s(<Calculator />) },
      { path: 'parts', element: s(<PartsList />) },
      { path: 'parts/:id', element: s(<PartDetail />) },
      { path: 'services', element: s(<ServicesList />) },
      { path: 'services/new', element: s(<ServiceForm />) },
      { path: 'services/:id', element: s(<ServiceForm />) },
      { path: 'sales', element: s(<SalesList />) },
      { path: 'sales/new', element: s(<SaleNew />) },
      { path: 'sales/:id', element: s(<SaleDetail />) },
      { path: 'overheads', element: s(<Overheads />) },
      { path: 'settings', element: s(<Settings />) },
      { path: 'settings/categories', element: s(<Categories />) },
      { path: 'settings/channels', element: s(<Channels />) },
      { path: 'more', element: <More /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
