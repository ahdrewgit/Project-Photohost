import type { ReactNode } from "react"
import { Navigate } from "react-router-dom"
import { useSessionStore, type AppRole } from "@/stores/useSessionStore"

export default function RequireAuth({ children, role }: { children: ReactNode; role?: AppRole }) {
  const isReady = useSessionStore((s) => s.isReady)
  const user = useSessionStore((s) => s.user)
  const currentRole = useSessionStore((s) => s.role)

  if (!isReady) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-6 w-40 animate-pulse rounded bg-zinc-800" />
          <div className="mt-6 h-24 w-full animate-pulse rounded bg-zinc-900" />
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (role && currentRole && currentRole !== role) return <Navigate to="/" replace />

  return <>{children}</>
}

