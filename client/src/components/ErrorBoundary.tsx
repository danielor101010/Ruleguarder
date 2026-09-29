import { Component, type ReactNode } from "react";
import { errorMessage } from "../lib/errors";
import { Button, Panel } from "./ui";

interface State {
  error: unknown;
  failed: boolean;
}

/**
 * Last line of defence: an error while rendering shows a message and a reload button
 * instead of a blank page. Data errors are handled in the hooks; this catches bugs.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, failed: false };

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
        <Panel className="flex max-w-md flex-col items-start gap-3 p-6">
          <h1 className="text-lg font-semibold text-zinc-900">Something went wrong</h1>
          <p role="alert" className="text-sm text-zinc-600">
            The page hit an unexpected error. Your rules, documents and reports are saved on the server, so reloading
            is safe.
          </p>
          <p className="w-full break-words font-mono text-xs text-zinc-500">{errorMessage(this.state.error)}</p>
          <Button onClick={() => window.location.reload()}>Reload page</Button>
        </Panel>
      </div>
    );
  }
}
