import { createBrowserRouter } from "react-router";
import { Layout } from "./components/layout";
import { SuggestionsPage } from "./components/suggestions-page";
import { GroupsPage } from "./components/groups-page";
import { FriendsPage } from "./components/friends-page";
import { AdminPage } from "./components/admin-page";
import { StatisticsPage } from "./components/statistics-page";
import { ProtectedRoute } from "./components/protected-route";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: SuggestionsPage },
      { path: "groups", Component: GroupsPage },
      { path: "friends", Component: FriendsPage },
      {
        path: "admin",
        element: (
          <ProtectedRoute requiredRole="ADMIN">
            <AdminPage />
          </ProtectedRoute>
        ),
      },
      { path: "statistics", Component: StatisticsPage },
    ],
  },
]);
