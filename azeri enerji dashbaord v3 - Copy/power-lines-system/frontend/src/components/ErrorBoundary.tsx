import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { translate, type Language } from "../i18n/translations";

function storedLanguage(): Language {
  try {
    const v = localStorage.getItem("language");
    return v === "az" ? "az" : "en";
  } catch {
    return "en";
  }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const lang = storedLanguage();
      const tr = (key: string) => translate(lang, key);
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "var(--layout-bg)" }}>
          <div className="glass rounded-2xl border border-premium-danger/50 bg-premium-danger/10 p-8 max-w-2xl w-full shadow-premium">
            <div className="flex items-center gap-4 mb-6">
              <AlertCircle className="text-4xl text-red-400" size={40} />
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">{tr("errorBoundary.title")}</h1>
                <p className="text-neutral-400">
                  {tr("errorBoundary.description")}
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="mb-6 p-4 rounded-lg dash-nested">
                <div className="text-sm font-semibold text-premium-danger mb-2">{tr("errorBoundary.errorDetails")}</div>
                <div className="text-xs dash-text-body font-Poppins break-all">
                  {this.state.error.toString()}
                </div>
                {this.state.errorInfo && (
                  <details className="mt-3">
                    <summary className="text-xs dash-text-muted cursor-pointer hover:dash-text-body">
                      {tr("errorBoundary.stackTrace")}
                    </summary>
                    <pre className="mt-2 text-xs dash-text-subtle overflow-auto max-h-40">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-premium-accent text-white font-semibold hover:bg-premium-accent/80 transition-colors"
              >
                {tr("errorBoundary.tryAgain")}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg font-semibold transition-colors dash-text-primary"
                style={{ backgroundColor: "var(--dash-inset-bg)", borderColor: "var(--dash-inset-border)", borderWidth: 1 }}
              >
                {tr("errorBoundary.refreshPage")}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

