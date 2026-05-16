'use server';

import { runAiTest, type AiTestResult, type LLMIntent } from '@/lib/kernel';

const INTENTS: LLMIntent[] = [
  'editorial_rewrite',
  'caption_hook',
  'classify_niche',
  'policy_check',
  'tool_loop',
];

const POLICY_SCHEMA = {
  type: 'object',
  required: ['risk', 'flags', 'reasoning'],
  properties: {
    risk: { type: 'number' },
    flags: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
};

const NICHE_SCHEMA = {
  type: 'object',
  required: ['niche', 'confidence'],
  properties: {
    niche: { type: 'string' },
    confidence: { type: 'number' },
  },
};

export interface AiLabState {
  status: 'idle' | 'success' | 'error';
  result?: AiTestResult;
  message?: string;
  request?: { intent: LLMIntent; system: string; user: string; schema_kind: string };
}

export async function runAiTestAction(_prev: AiLabState, formData: FormData): Promise<AiLabState> {
  const intentRaw = String(formData.get('intent') ?? '').trim();
  const system = String(formData.get('system') ?? '').trim();
  const user = String(formData.get('user') ?? '').trim();
  const schemaKind = String(formData.get('schema_kind') ?? 'none');
  if (!INTENTS.includes(intentRaw as LLMIntent)) {
    return { status: 'error', message: `unknown intent: ${intentRaw}` };
  }
  if (!system || !user) {
    return { status: 'error', message: 'system + user prompts required' };
  }
  const intent = intentRaw as LLMIntent;
  const args: Parameters<typeof runAiTest>[0] = { intent, system, user };
  if (schemaKind === 'policy') args.schema = POLICY_SCHEMA;
  else if (schemaKind === 'niche') args.schema = NICHE_SCHEMA;
  try {
    const result = await runAiTest(args);
    return { status: 'success', result, request: { intent, system, user, schema_kind: schemaKind } };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
