// Catches render errors anywhere below it and shows a friendly fallback
// instead of a white screen. See issue #30.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled render error:', error, errorInfo.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-ink px-6">
          <div className="card text-center">
            <h1 className="text-xl font-semibold text-text font-body">
              Something went wrong
            </h1>
            <p className="mt-2 text-muted font-body">
              Please reload the app to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary mt-6 px-6 py-3 font-body"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
