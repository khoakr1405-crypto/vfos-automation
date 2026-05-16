import { SpanStatusCode, trace, type Span, type SpanOptions, type Tracer } from '@opentelemetry/api';

let cached: Tracer | null = null;

export function tracer(): Tracer {
  if (cached) return cached;
  cached = trace.getTracer('vfos.kernel', '0.9.0');
  return cached;
}

/**
 * Run `fn` inside an active span. On throw, records the exception and sets
 * status=ERROR. Always calls `span.end()`.
 */
export async function withSpan<T>(
  name: string,
  opts: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  return tracer().startActiveSpan(name, opts, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      if (err instanceof Error) span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
