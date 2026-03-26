import { Link } from "react-router-dom"

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-14">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-400">PhotoHost</div>
          <Link
            className="rounded-md border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
            to="/login"
          >
            Log in
          </Link>
        </div>
        <div className="mt-14">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            A Pixieset-style proofing and delivery app.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-zinc-300">
            Create private galleries, collect client selections, and unlock downloads with Stripe Checkout.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white" to="/login">
              Get started
            </Link>
            <a
              className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
              href="#features"
            >
              See features
            </a>
          </div>
        </div>

        <div id="features" className="mt-16 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-5">
            <div className="text-sm font-medium">Proofing</div>
            <div className="mt-2 text-sm text-zinc-400">Favorites, ratings, and selection limits per gallery.</div>
          </div>
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-5">
            <div className="text-sm font-medium">Delivery</div>
            <div className="mt-2 text-sm text-zinc-400">Signed URL downloads unlocked after payment.</div>
          </div>
          <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-5">
            <div className="text-sm font-medium">Admin</div>
            <div className="mt-2 text-sm text-zinc-400">Create galleries, upload, invite clients, track status.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
