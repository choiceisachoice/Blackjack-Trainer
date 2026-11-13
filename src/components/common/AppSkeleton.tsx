import { useTranslation } from 'react-i18next'

/**
 * The app's outline, shown while the app itself is on the way.
 *
 * What a signed-in visitor saw on every reload was an empty black screen, then
 * a full-screen spinner for a fraction of a second, then the app — three
 * different screens for one load. A skeleton is the third of those drawn
 * early: the bar where the bar will be, a card where the plan will be, rows
 * where the stages will be. When the real screen arrives nothing moves, it
 * fills in.
 *
 * The geometry is the trainer's own and has to stay that way — the same
 * `h-14` bar with the same border, the same `max-w-3xl` plan column inside
 * the same `max-w-5xl` page. A skeleton that is off by a few pixels is worse
 * than none: it turns the handover into a jump.
 *
 * No delay before it appears, unlike `AppLoader`. A spinner that flashes
 * reads as a stutter, which is why that one waits; an outline of the page
 * that is about to be there reads as the page, however briefly it shows.
 *
 * @param label - What is being waited for, for a screen reader; defaults to
 *   the generic "loading your training"
 */
export function AppSkeleton({ label }: { label?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className="app-canvas h-screen h-dvh flex flex-col overflow-hidden"
      role="status"
      aria-busy="true"
      aria-label={label ?? t('common.loadingTraining')}
      data-testid="app-skeleton"
    >
      <div
        className="h-14 shrink-0 flex items-center gap-4 px-4 border-b border-contrast/10"
        style={{ backgroundColor: 'var(--color-topbar)' }}
        aria-hidden
      >
        <span className="w-8 h-8 rounded-lg bg-gold/15 border border-gold/30" />
        <div className="hidden sm:flex items-center gap-2">
          {[64, 76, 70, 62, 72].map((w, i) => <Bone key={i} className="h-8 rounded-lg" style={{ width: w }} />)}
        </div>
        <span className="ml-auto flex items-center gap-2">
          <Bone className="h-8 w-16 rounded-lg" />
          <Bone className="h-8 w-8 rounded-lg" />
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden px-4" aria-hidden>
        <div className="w-full max-w-5xl mx-auto pt-10">
          <Bone className="h-9 w-[min(22rem,70%)] mx-auto rounded-lg" />
          <Bone className="mt-3 h-4 w-[min(16rem,50%)] mx-auto rounded" />

          <div className="w-full max-w-3xl mx-auto mt-10 space-y-4">
            <div className="surface p-6">
              <Bone className="h-3 w-24 rounded" />
              <Bone className="mt-4 h-6 w-2/3 rounded" />
              <Bone className="mt-3 h-4 w-full rounded" />
              <Bone className="mt-2 h-4 w-4/5 rounded" />
              <div className="mt-6 flex gap-3">
                <Bone className="h-10 w-36 rounded-xl" />
                <Bone className="h-10 w-32 rounded-xl" />
              </div>
            </div>
            {[0, 1, 2].map(i => (
              <div key={i} className="surface p-5 flex items-center gap-4">
                <Bone className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1">
                  <Bone className="h-4 w-1/3 rounded" />
                  <Bone className="mt-2.5 h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One placeholder block. The pulse is CSS, so the reduced-motion reset in `index.css` stops it. */
function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`block bg-contrast/[0.07] animate-pulse ${className}`} style={style} />
}
