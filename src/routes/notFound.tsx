import { createRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { buttonStyles } from "../components/ui";
import { rootRoute } from "./root";

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="bg-gradient-to-b from-fg-faint to-transparent bg-clip-text font-mono text-7xl font-semibold text-transparent">404</p>
      <h1 className="mt-4 text-xl font-semibold text-fg">Page not found</h1>
      <p className="mt-1.5 text-sm text-fg-subtle">That path doesn't exist in the optimizer console.</p>
      <Link to="/" className={buttonStyles("primary", "md", "mt-6")}>
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to overview
      </Link>
    </div>
  );
}

export const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: NotFoundPage,
});
