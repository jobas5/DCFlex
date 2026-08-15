import { createRoute, Link } from "@tanstack/react-router";
import { rootRoute } from "./root";

function NotFoundPage() {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-5xl font-bold text-slate-700">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-200">Page not found</h1>
      <p className="mt-1 text-sm text-slate-400">That path doesn't exist in the optimizer console.</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        Back to Overview
      </Link>
    </div>
  );
}

export const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$",
  component: NotFoundPage,
});
