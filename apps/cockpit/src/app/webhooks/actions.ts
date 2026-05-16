'use server';

import { revalidatePath } from 'next/cache';
import {
  createWebhook,
  deleteWebhook,
  testWebhook,
  updateWebhook,
} from '@/lib/kernel';

export interface CreateWebhookState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  webhook?: {
    id: string;
    url: string;
    schemas: readonly string[];
  };
  secret?: string;
}

export async function createWebhookAction(
  _prev: CreateWebhookState,
  formData: FormData,
): Promise<CreateWebhookState> {
  const url = String(formData.get('url') ?? '').trim();
  const schemas = formData
    .getAll('schemas')
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!url) return { status: 'error', message: 'url is required' };
  if (schemas.length === 0) {
    return { status: 'error', message: 'select at least one event schema' };
  }
  try {
    const res = await createWebhook({ url, schemas, enabled: true });
    revalidatePath('/webhooks');
    return {
      status: 'success',
      webhook: {
        id: res.webhook.id,
        url: res.webhook.url,
        schemas: res.webhook.schemas,
      },
      secret: res.secret,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleWebhookAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const enabledRaw = String(formData.get('enabled') ?? 'false');
  if (!id) return;
  await updateWebhook({ id, enabled: enabledRaw !== 'true' });
  revalidatePath('/webhooks');
}

export async function deleteWebhookAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await deleteWebhook(id);
  revalidatePath('/webhooks');
}

export async function testWebhookAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await testWebhook(id);
  revalidatePath('/webhooks');
}
