import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createTRPCClient, TRPCClientError, type TRPCLink } from "@trpc/client"
import { observable } from "@trpc/server/observable"
import { useState } from "react"
import type { AppRouter } from "../../../main/trpc/router"
import { TRPCProvider } from "./trpc"

/** What each procedure answers with, by its path such as `settings.get`, for a test. */
export type StubAnswers = Record<string, unknown>

interface StubTrpcProviderProps {
  answers: StubAnswers
  children: React.ReactNode
}

/** Gives `children` a tRPC client that answers every call from `answers`, and refuses the rest. */
export function StubTrpcProvider({ answers, children }: StubTrpcProviderProps): React.JSX.Element {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  )
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({ links: [answeringLink(answers)] })
  )
  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  )
}

/** A link that ends every call with the answer for its path. */
function answeringLink(answers: StubAnswers): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (!(op.path in answers)) {
          observer.error(TRPCClientError.from(new Error(`Nothing answers ${op.path}.`)))
          return
        }
        observer.next({ result: { type: "data", data: answers[op.path] } })
        observer.complete()
      })
}
