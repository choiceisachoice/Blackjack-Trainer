import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Called when the user resets, so the parent can send them somewhere safe. */
  onReset?: () => void
  /**
   * Stand on its own instead of filling a flex parent.
   *
   * The in-app boundary sits inside the trainer's flex column, where `flex-1`
   * centres it. The one above the routes has `#root` for a parent, which is not
   * a flex container — there `flex-1` does nothing and the panel would sit at
   * the top of an otherwise empty page.
   */
  fullScreen?: boolean
}

/**
 * Did a code-split chunk fail to arrive, rather than a component throwing?
 *
 * Routes are lazy, so their `import()` runs at render time. A deploy replaces
 * the hashed filenames, and any tab still holding the old page then requests a
 * URL that no longer exists. React surfaces that as a render error here, but it
 * is a categorically different failure: re-rendering re-requests the same dead
 * URL, so "Try again" is a loop that cannot terminate. Only a full reload can
 * recover, because only a reload fetches the new `index.html`.
 *
 * Matched on the message because that is all the platform gives us — there is
 * no error type for this. The three phrasings below are Chromium, Firefox and
 * Safari respectively; a miss degrades to the ordinary retry, which is the safe
 * direction to be wrong in.
 */
function isChunkLoadError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError/i
    .test(`${error.name}: ${error.message}`)
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render/lifecycle errors in the subtree and shows a recoverable
 * fallback instead of unmounting the whole app to a blank screen. Error
 * boundaries must be class components — there is no hook equivalent.
 *
 * The user's data is safe: localStorage and the cloud are untouched by a render
 * crash, so "Try again" (or navigating away) recovers without losing progress.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for diagnosis; a real error-reporting sink can hook in here later.
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack)
  }

  private handleReset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    const staleChunk = isChunkLoadError(error)

    return (
      <ErrorFallback
        staleChunk={staleChunk}
        fullScreen={this.props.fullScreen}
        onReload={this.handleReload}
        onReset={this.handleReset}
      />
    )
  }
}
