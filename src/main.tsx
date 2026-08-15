import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { masterDataRoute } from "./routes/masterData";
import { modelRoute } from "./routes/model";
import { notFoundRoute } from "./routes/notFound";
import { optimizeRoute } from "./routes/optimize";
import { optimizeDetailRoute } from "./routes/optimizeDetail";
import { overviewRoute } from "./routes/overview";
import { rootRoute } from "./routes/root";
import { shadowRoute } from "./routes/shadow";
import { transferRoute } from "./routes/transfer";
import "./styles.css";

const routeTree = rootRoute.addChildren([
  overviewRoute,
  optimizeRoute,
  optimizeDetailRoute,
  shadowRoute,
  transferRoute,
  modelRoute,
  masterDataRoute,
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
