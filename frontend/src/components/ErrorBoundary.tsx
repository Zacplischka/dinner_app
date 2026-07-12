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
        <div className="flex items-center justify-center min-h-screen bg-midnight px-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-cream-100 font-body">
              Something went wrong
            </h1>
            <p className="mt-2 text-cream-400 font-body">
              Please reload the app to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-6 py-3 rounded-xl bg-amber text-midnight font-semibold font-body"
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
