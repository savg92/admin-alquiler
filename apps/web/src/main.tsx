import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { OwnerPortal } from "./portal/OwnerPortal";
import { LoginForm, RequirePermissions, useSession } from "./portal/session";
import { TenantPortal } from "./portal/TenantPortal";

const queryClient = new QueryClient();

const rootRoute = createRootRoute({
  component: () => <App />,
});

const tenantRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/tenant",
  component: TenantGate,
});

const ownerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/portal/owner",
  component: OwnerGate,
});

function TenantGate() {
  const { session, memberships } = useSession();
  const [ready, setReady] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  if (!session || !ready) {
    return (
      <main style={{ margin: "0 auto", maxWidth: 720, padding: 16 }}>
        <h1>Portal del arrendatario</h1>
        <LoginForm onDone={() => setReady(true)} />
      </main>
    );
  }
  if (!propertyId) {
    return (
      <main style={{ margin: "0 auto", maxWidth: 720, padding: 16 }}>
        <h1>Portal del arrendatario</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("propertyId");
            if (typeof value === "string" && value) {
              setPropertyId(value);
            }
          }}
        >
          <label>
            Propiedad (ID)
            <input name="propertyId" required />
          </label>
          <button type="submit">Continuar</button>
        </form>
      </main>
    );
  }
  return (
    <RequirePermissions memberships={memberships} required={[]}>
      <TenantPortal session={session} memberships={memberships} propertyId={propertyId} />
    </RequirePermissions>
  );
}

function OwnerGate() {
  const { session, memberships } = useSession();
  const [ready, setReady] = useState(false);
  if (!session || !ready) {
    return (
      <main style={{ margin: "0 auto", maxWidth: 720, padding: 16 }}>
        <h1>Portal del propietario</h1>
        <LoginForm onDone={() => setReady(true)} />
      </main>
    );
  }
  return (
    <RequirePermissions memberships={memberships} required={["finance:read"]}>
      <OwnerPortal session={session} />
    </RequirePermissions>
  );
}

const routeTree = rootRoute.addChildren([tenantRoute, ownerRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
