'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-error/10 border border-error/20 rounded-2xl animate-in fade-in">
          <div className="w-16 h-16 bg-error/20 text-error rounded-full flex items-center justify-center mb-4">
            <span className="material-symbols-outlined text-[32px]">warning</span>
          </div>
          <h2 className="font-headline-sm text-error mb-2">Algo salió mal</h2>
          <p className="font-body-sm text-on-surface-variant text-center max-w-xs mb-6">
            La aplicación ha encontrado un problema inesperado en esta sección.
          </p>
          <button
            className="bg-error/20 text-error px-6 py-2 rounded-full font-label-md hover:bg-error/30 transition-colors"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
