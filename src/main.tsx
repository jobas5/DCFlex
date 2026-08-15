import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { controlRoute } from "./routes/control";
import { docsRoute } from "./routes/docs";
import { modelRoute } from "./routes/model";
import { notFoundRoute } from "./routes/notFound";
import { overviewRoute } from "./routes/overview";
import { rootRoute } from "./routes/root";
import { whatifRoute } from "./routes/whatif";
import { whatifDetailRoute } from "./routes/whatifDetail";
import "./styles.css";

const routeTree = rootRoute.addChildren([
  overviewRoute,
  whatifRoute,
  whatifDetailRoute,
  controlRoute,
  modelRoute,
  docsRoute,
  notFoundRoute,
]);

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
