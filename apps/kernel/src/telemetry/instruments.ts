import { metrics, type Counter, type Histogram } from '@opentelemetry/api';

interface KernelInstruments {
  syscall_total: Counter;
  syscall_duration_ms: Histogram;
  event_published_total: Counter;
  event_handled_total: Counter;
  queue_enqueued_total: Counter;
  queue_job_total: Counter;
  queue_job_duration_ms: Histogram;
  llm_calls_total: Counter;
  llm_tokens_total: Counter;
  llm_cost_cents_total: Counter;
  compliance_decision_total: Counter;
  publish_total: Counter;
  publish_duration_ms: Histogram;
  ratelimit_blocks_total: Counter;
  budget_blocks_total: Counter;
  scheduler_runs_total: Counter;
  webhook_deliveries_total: Counter;
}

let cached: KernelInstruments | null = null;

export function instruments(): KernelInstruments {
  if (cached) return cached;
  const meter = metrics.getMeter('vfos.kernel', '0.6.0');
  cached = {
    syscall_total: meter.createCounter('vfos_syscall_total', {
      description: 'Total syscall invocations (labels: name, status).',
    }),
    syscall_duration_ms: meter.createHistogram('vfos_syscall_duration_ms', {
      description: 'Syscall execution time in milliseconds.',
      unit: 'ms',
    }),
    event_published_total: meter.createCounter('vfos_event_published_total', {
      description: 'Events published to the bus (labels: schema, bus).',
    }),
    event_handled_total: meter.createCounter('vfos_event_handled_total', {
      description: 'Events successfully handled by subscribers (labels: schema, bus).',
    }),
    queue_enqueued_total: meter.createCounter('vfos_queue_enqueued_total', {
      description: 'Jobs enqueued (labels: queue, impl).',
    }),
    queue_job_total: meter.createCounter('vfos_queue_job_total', {
      description: 'Jobs processed (labels: queue, status).',
    }),
    queue_job_duration_ms: meter.createHistogram('vfos_queue_job_duration_ms', {
      description: 'Queue job execution time (labels: queue).',
      unit: 'ms',
    }),
    llm_calls_total: meter.createCounter('vfos_llm_calls_total', {
      description: 'LLM completions (labels: driver, model, intent, status).',
    }),
    llm_tokens_total: meter.createCounter('vfos_llm_tokens_total', {
      description: 'LLM token usage (labels: driver, model, kind=input|cached_input|output).',
    }),
    llm_cost_cents_total: meter.createCounter('vfos_llm_cost_cents_total', {
      description: 'Cumulative LLM cost in cents (labels: driver, model).',
    }),
    compliance_decision_total: meter.createCounter('vfos_compliance_decision_total', {
      description: 'Compliance gate decisions (labels: decision, layer).',
    }),
    publish_total: meter.createCounter('vfos_publish_total', {
      description: 'Platform publish attempts (labels: platform, mode, status).',
    }),
    publish_duration_ms: meter.createHistogram('vfos_publish_duration_ms', {
      description: 'Publish call duration in milliseconds (labels: platform, mode).',
      unit: 'ms',
    }),
    ratelimit_blocks_total: meter.createCounter('vfos_ratelimit_blocks_total', {
      description: 'Syscalls rejected by the rate limiter (labels: tenant_id, syscall).',
    }),
    budget_blocks_total: meter.createCounter('vfos_budget_blocks_total', {
      description: 'Calls rejected by the daily budget guard (labels: tenant_id, event).',
    }),
    scheduler_runs_total: meter.createCounter('vfos_scheduler_runs_total', {
      description: 'Scheduled pipelines fired by the scheduler loop (labels: tenant_id).',
    }),
    webhook_deliveries_total: meter.createCounter('vfos_webhook_deliveries_total', {
      description: 'Webhook delivery attempts (labels: outcome=delivered|failed, schema).',
    }),
  };
  return cached;
}
