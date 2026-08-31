import { Component, type ReactNode } from "react";

import { APP_RENDER_FAILURE_MESSAGE } from "@/domain/errors";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { LoadFailureView } from "@/ui/loading-view";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly title?: string;
}

interface AppErrorBoundaryState {
  readonly failed: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    recordDiagnostic("app", "APP_RENDER_FAILED", error);
  }

  private retry = () => {
    this.setState({ failed: false });
  };

  render() {
    if (this.state.failed) {
      return (
        <LoadFailureView
          diagnosticCode="APP_RENDER_FAILED"
          message={APP_RENDER_FAILURE_MESSAGE}
          onRetry={this.retry}
          title={this.props.title ?? "PflegeShift konnte nicht angezeigt werden"}
        />
      );
    }
    return this.props.children;
  }
}
