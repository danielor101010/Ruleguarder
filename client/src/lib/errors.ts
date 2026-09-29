/** Human-readable message for any thrown value; network failures get a clear explanation. */
export function errorMessage(err: unknown): string {
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Network error: the server could not be reached. Check your connection and try again.";
  }
  return err instanceof Error ? err.message : String(err);
}
