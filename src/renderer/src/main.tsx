import "./index.css"

import React from "react"
import ReactDOM from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createHashHistory, createRouter, RouterProvider } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { createTrpcClient, TRPCProvider } from "./lib/trpc"

const queryClient = new QueryClient()
const trpcClient = createTrpcClient()

// Hash history keeps routing inside the single index.html that Electron loads from disk.
const router = createRouter({ routeTree, history: createHashHistory() })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <RouterProvider router={router} />
      </TRPCProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
