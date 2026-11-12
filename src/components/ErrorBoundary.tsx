import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="app">
          <main className="app-main">
            <div className="card status error">
              <strong>Algo deu errado.</strong>
              <span className="muted small">{this.state.error.message}</span>
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.reload();
                }}
              >
                Recarregar
              </button>
            </div>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}
