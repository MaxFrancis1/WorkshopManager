import { createHashRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';
import { AppShell } from './layout/AppShell';
import { Login } from './pages/Login';
import { More } from './pages/More';
import { Placeholder } from './pages/Placeholder';

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
      { path: 'items', element: <Placeholder title="Items" phase={3} /> },
      { path: 'jobs', element: <Placeholder title="Jobs" phase={4} /> },
      { path: 'purchases', element: <Placeholder title="Purchases" phase={3} /> },
      { path: 'parts', element: <Placeholder title="Parts" phase={4} /> },
      { path: 'services', element: <Placeholder title="Services" phase={4} /> },
      { path: 'sales', element: <Placeholder title="Sales" phase={5} /> },
      { path: 'overheads', element: <Placeholder title="Overheads" phase={6} /> },
      { path: 'settings', element: <Placeholder title="Settings" phase={6} /> },
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
