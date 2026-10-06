import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './States';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Citlivé údaje nelogujeme do konzole. */ }
  render() {
    if (this.state.failed) return <main className="access-page"><ErrorState message="Aplikaci se nepodařilo zobrazit. Obnovte stránku; pokud problém trvá, kontaktujte správce." onRetry={() => window.location.reload()} /></main>;
    return this.props.children;
  }
}
