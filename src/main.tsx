import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { RouteConfig } from "./app/config/config.ts";
import { User } from "./components/user/User.tsx";
import { Auth } from "./components/auth/Auth.tsx";
import { HomePanel } from "./app/pages/main/HomePanel.tsx";
import "./index.css";
import App from "./App.tsx";
import { Room } from "./components/room/Room.tsx";

const router = createBrowserRouter([
  {
    path: RouteConfig.main,
    Component: App,
    children: [
      { index: true, Component: HomePanel },
      {
        path: RouteConfig.user + "/:name",
        Component: User,
      },
      {
        path: RouteConfig.auth,
        Component: Auth,
      },
      {
        path: RouteConfig.room + "/:roomId",
        Component: Room,
      },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
