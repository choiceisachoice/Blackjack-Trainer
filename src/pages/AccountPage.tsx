import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * `/account` — subscription & billing. Placeholder shell for the routing slice;
 * the real Account page (plan status + Manage/Cancel via the Stripe customer
 * portal) lands in a later slice.
 */
export function AccountPage() {
  return (
    <div className="min-h-screen bg-casino-bg text-content">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link to="/app" className="inline-flex items-center gap-2 text-sm text-content/60 hover:text-content">
          <ArrowLeft size={16} /> Back to app
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">Account</h1>
        <p className="mt-3 text-content/60">
          Subscription and billing management (plan status, Manage / Cancel via Stripe) is coming in
          the next slice.
        </p>
      </div>
    </div>
  )
}
