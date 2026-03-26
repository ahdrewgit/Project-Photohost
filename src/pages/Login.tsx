import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { supabase } from "@/utils/supabaseClient"
import { useSessionStore } from "@/stores/useSessionStore"

type Tab = "photographer" | "client"

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ")
}

export default function Login() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const inviteToken = params.get("invite")
  const isReady = useSessionStore((s) => s.isReady)
  const role = useSessionStore((s) => s.role)
  const user = useSessionStore((s) => s.user)

  const initialTab = useMemo<Tab>(() => (inviteToken ? "client" : "photographer"), [inviteToken])
  const [tab, setTab] = useState<Tab>(initialTab)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isReady) return
    if (!user) return
    if (!role) return

    if (role === "photographer") {
      navigate("/admin", { replace: true })
      return
    }

    if (inviteToken) {
      navigate(`/invite?token=${encodeURIComponent(inviteToken)}`, { replace: true })
    }
  }, [inviteToken, isReady, navigate, role, user])

  async function signOut() {
    await supabase.auth.signOut()
    navigate("/login", { replace: true })
  }

  async function onPhotographerSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)
    setLoading(true)
    try {
      const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (!signInErr) {
        const userId = signInData.user?.id
        if (userId) {
          await supabase.from("photographer_profiles").upsert({ user_id: userId }, { onConflict: "user_id" })
        }
        navigate("/admin", { replace: true })
        return
      }

      const { error: signUpErr } = await supabase.auth.signUp({ email, password })
      if (signUpErr) throw signUpErr
      setStatus("Account created. Please confirm your email, then sign in.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  async function onClientMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus(null)
    setLoading(true)
    try {
      const redirectTo = `${window.location.origin}/invite?token=${encodeURIComponent(inviteToken ?? "")}`
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      })
      if (otpErr) throw otpErr
      setStatus("Magic link sent. Check your email to continue.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send magic link")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-zinc-400">PhotoHost</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Private client galleries. Proofing. Paid downloads.</h1>
          </div>
          <button
            className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            onClick={() => navigate("/")}
          >
            Back
          </button>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="text-sm text-zinc-400">Minimal. Fast. Photography-first.</div>
            <div className="mt-6 grid gap-3 text-sm text-zinc-200">
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">Proofing: favorites, ratings, selection limits</div>
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">Comments per image, realtime updates</div>
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">Pay-to-unlock downloads via Stripe Checkout</div>
              <div className="rounded-lg bg-zinc-900/40 px-4 py-3">Supabase Auth + DB + Storage + Functions</div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-6">
            <div className="flex rounded-lg border border-zinc-900 bg-zinc-950 p-1 text-sm">
              <button
                type="button"
                className={classNames(
                  "flex-1 rounded-md px-3 py-2",
                  tab === "photographer" && "bg-zinc-900 text-zinc-50",
                  tab !== "photographer" && "text-zinc-300 hover:bg-zinc-900/60",
                )}
                onClick={() => setTab("photographer")}
              >
                Photographer
              </button>
              <button
                type="button"
                className={classNames(
                  "flex-1 rounded-md px-3 py-2",
                  tab === "client" && "bg-zinc-900 text-zinc-50",
                  tab !== "client" && "text-zinc-300 hover:bg-zinc-900/60",
                )}
                onClick={() => setTab("client")}
              >
                Client
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={tab === "photographer" ? onPhotographerSignIn : onClientMagicLink}>
              {isReady && user && role && role !== "photographer" && !inviteToken && (
                <div className="rounded-lg border border-zinc-900 bg-zinc-900/30 p-3 text-sm text-zinc-200">
                  You’re already signed in.
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="rounded-md bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-950 hover:bg-white"
                      onClick={() => navigate("/")}
                    >
                      Go to home
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-900"
                      onClick={signOut}
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm text-zinc-300">Email</label>
                <input
                  className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-zinc-600"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>

              {tab === "photographer" && (
                <div>
                  <label className="text-sm text-zinc-300">Password</label>
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none ring-0 focus:border-zinc-600"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                  />
                  <div className="mt-2 text-xs text-zinc-500">If you don’t have an account, this will create one.</div>
                </div>
              )}

              {tab === "client" && !inviteToken && (
                <div className="rounded-lg border border-zinc-900 bg-zinc-900/30 p-3 text-sm text-zinc-300">
                  Ask your photographer for an invite link.
                </div>
              )}

              {status && <div className="rounded-lg border border-zinc-900 bg-zinc-900/30 p-3 text-sm text-zinc-200">{status}</div>}
              {error && <div className="rounded-lg border border-red-900/60 bg-red-900/20 p-3 text-sm text-red-200">{error}</div>}

              <button
                disabled={loading || (tab === "client" && !inviteToken)}
                className={classNames(
                  "w-full rounded-lg px-3 py-2 text-sm font-medium",
                  "bg-zinc-100 text-zinc-950 hover:bg-white",
                  (loading || (tab === "client" && !inviteToken)) && "cursor-not-allowed opacity-60",
                )}
                type="submit"
              >
                {tab === "photographer" ? (loading ? "Signing in…" : "Sign in") : loading ? "Sending…" : "Send magic link"}
              </button>
            </form>

            <div className="mt-6 text-xs text-zinc-500">By continuing you agree to your own Terms and Privacy.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
