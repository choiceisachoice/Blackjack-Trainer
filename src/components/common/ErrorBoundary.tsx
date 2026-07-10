import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Called when the user resets, so the parent can send them somewhere safe. */
  onReset?: () => void
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

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="surface max-w-md w-full p-8 text-center flex flex-col items-center gap-4">
          <h2 className="text-xl font-semibold text-gold-gradient">Something went wrong</h2>
          <p className="text-sm text-content/60">
            This screen hit an unexpected error. Your progress is safe — nothing was lost.
            You can try again or head back home.
          </p>
          <button
            onClick={this.handleReset}
            className="surface glow-hover inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-content cursor-pointer"
            data-testid="error-boundary-reset"
          >
            <RotateCcw size={16} />
            Try again
          </button>
        </div>
      </div>
    )
  }
}
