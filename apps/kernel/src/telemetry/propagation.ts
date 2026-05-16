import { ROOT_CONTEXT, context, propagation, type Context } from '@opentelemetry/api';

export interface TraceCarrier {
  traceparent?: string;
  tracestate?: string;
}

/**
 * Capture the current trace context as a W3C carrier suitable for
 * embedding in event payloads, queue job data, or HTTP headers.
 */
export function injectCurrent(): TraceCarrier {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  const result: TraceCarrier = {};
  if (carrier.traceparent) result.traceparent = carrier.traceparent;
  if (carrier.tracestate) result.tracestate = carrier.tracestate;
  return result;
}

/**
 * Reconstruct a Context from an inbound carrier. If the carrier is empty
 * (or missing), returns ROOT_CONTEXT so a fresh trace is started.
 */
export function extractCarrier(carrier: TraceCarrier | undefined | null): Context {
  if (!carrier || (!carrier.traceparent && !carrier.tracestate)) return ROOT_CONTEXT;
  return propagation.extract(ROOT_CONTEXT, carrier);
}
