import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { PublicOnly, RequireAdmin, RequireAuth } from './guards';
import { RouteError } from './route-error';

/** Lazy route helper: modules export their page component as `default`. */
const page = (
  load: () => Promise<{ default: React.ComponentType }>,
): Pick<RouteObject, 'lazy'> => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      // Public home page. Signed-in people see it too, with an "Open dashboard" button.
      { index: true, ...page(() => import('@/features/home/home-page')) },
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', ...page(() => import('@/features/auth/login-page')) },
          { path: '/setup', ...page(() => import('@/features/auth/setup-page')) },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            errorElement: <RouteError />,
            children: [
              {
                errorElement: <RouteError />,
                children: [
                  {
                    path: 'dashboard',
                    ...page(() => import('@/features/dashboard/dashboard-page')),
                  },
                  { path: 'leads', ...page(() => import('@/features/leads/leads-page')) },
                  { path: 'leads/:id', ...page(() => import('@/features/leads/lead-detail-page')) },
                  { path: 'contacts', ...page(() => import('@/features/contacts/contacts-page')) },
                  {
                    path: 'contacts/:id',
                    ...page(() => import('@/features/contacts/contact-detail-page')),
                  },
                  {
                    path: 'inbox',
                    ...page(() => import('@/features/inbox/inbox-layout')),
                    children: [
                      // One route for /inbox/comments and /inbox/comments/:mediaId so the posts stay mounted.
                      {
                        path: 'comments/:mediaId?',
                        ...page(() => import('@/features/inbox/comments-page')),
                      },
                      // One route for /inbox and /inbox/:id so the list stays mounted.
                      { path: ':id?', ...page(() => import('@/features/inbox/messages-page')) },
                    ],
                  },
                  { path: 'pipeline', ...page(() => import('@/features/pipeline/pipeline-page')) },
                  {
                    path: 'deals/:id',
                    ...page(() => import('@/features/pipeline/deal-detail-page')),
                  },
                  { path: 'tasks', ...page(() => import('@/features/tasks/tasks-page')) },
                  {
                    path: 'workflows',
                    ...page(() => import('@/features/workflows/workflows-page')),
                  },
                  {
                    path: 'workflows/new',
                    ...page(() => import('@/features/workflows/workflow-editor-page')),
                  },
                  {
                    path: 'workflows/:id',
                    ...page(() => import('@/features/workflows/workflow-editor-page')),
                  },
                  {
                    path: 'workflows/:id/runs',
                    ...page(() => import('@/features/workflows/workflow-runs-page')),
                  },
                  {
                    path: 'notifications',
                    ...page(() => import('@/features/notifications/notifications-page')),
                  },
                  {
                    path: 'settings',
                    ...page(() => import('@/features/settings/settings-layout')),
                    children: [
                      { index: true, element: <Navigate to="profile" replace /> },
                      {
                        path: 'profile',
                        ...page(() => import('@/features/settings/profile-page')),
                      },
                      {
                        path: 'auto-reply',
                        ...page(() => import('@/features/settings/auto-reply-page')),
                      },
                      {
                        element: <RequireAdmin />,
                        children: [
                          { path: 'team', ...page(() => import('@/features/settings/team-page')) },
                          {
                            path: 'pipelines',
                            ...page(() => import('@/features/settings/pipelines-page')),
                          },
                          {
                            path: 'general',
                            ...page(() => import('@/features/settings/general-page')),
                          },
                          {
                            path: 'instagram',
                            ...page(() => import('@/features/settings/instagram-page')),
                          },
                        ],
                      },
                    ],
                  },
                  { path: '*', ...page(() => import('@/features/not-found-page')) },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
