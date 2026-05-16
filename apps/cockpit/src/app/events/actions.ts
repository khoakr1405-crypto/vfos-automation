'use server';

import { revalidatePath } from 'next/cache';
import { replayEvent } from '@/lib/kernel';

export async function replayEventAction(formData: FormData): Promise<void> {
  const event_id = String(formData.get('event_id') ?? '').trim();
  if (!event_id) return;
  await replayEvent(event_id);
  revalidatePath('/events');
}
