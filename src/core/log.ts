/**
 * Structured logging that cannot carry personal data by construction: fields
 * are limited to primitives, so tool results, request bodies and upstream
 * payloads cannot be passed in. Tokens appear only as their short hash id.
 */

export type LogValue = string | number | boolean | null | undefined;

export type LogSink = (line: string) => void;

let sink: LogSink = (line) => console.log(line);

/** Tests swap the sink to inspect what would be logged. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export function logEvent(event: string, fields: Record<string, LogValue> = {}): void {
  sink(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }));
}
