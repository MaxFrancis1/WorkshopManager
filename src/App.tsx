import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/Login';
import { More } from './pages/More';
import { Placeholder } from './pages/Placeholder';
import { ItemDetail } from './pages/items/ItemDetail';
import { ItemForm } from './pages/items/ItemForm';
import { ItemsList } from './pages/items/ItemsList';
import { PurchaseDetail } from './pages/purchases/PurchaseDetail';
import { PurchaseNew } from './pages/purchases/PurchaseNew';
import { PurchasesList } from './pages/purchases/PurchasesList';
import { Categories } from './pages/settings/Categories';
import { Settings } from './pages/settings/Settings';

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
      { index: true, element: <Placeholder title="Dashboard" phase={6} showDate /> },
      { path: 'items', element: <ItemsList /> },
      { path: 'items/new', element: <ItemForm /> },
      { path: 'items/:id', element: <ItemDetail /> },
      { path: 'items/:id/edit', element: <ItemForm /> },
      { path: 'jobs', element: <Placeholder title="Jobs" phase={4} /> },
      { path: 'purchases', element: <PurchasesList /> },
      { path: 'purchases/new', element: <PurchaseNew /> },
      { path: 'purchases/:id', element: <PurchaseDetail /> },
      { path: 'parts', element: <Placeholder title="Parts" phase={4} /> },
      { path: 'services', element: <Placeholder title="Services" phase={4} /> },
      { path: 'sales', element: <Placeholder title="Sales" phase={5} /> },
      { path: 'overheads', element: <Placeholder title="Overheads" phase={6} /> },
      { path: 'settings', element: <Settings /> },
      { path: 'settings/categories', element: <Categories /> },
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
