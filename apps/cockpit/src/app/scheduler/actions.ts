'use server';

import { revalidatePath } from 'next/cache';
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  updateSchedule,
} from '@/lib/kernel';

export interface CreateScheduleState {
  status: 'idle' | 'success' | 'error';
  message?: string;
}

export async function createScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  const name = String(formData.get('name') ?? '').trim();
  const cron_expr = String(formData.get('cron_expr') ?? '').trim();
  const target_platform = String(formData.get('target_platform') ?? 'tiktok');
  const caption = String(formData.get('caption') ?? '').trim();
  const source_url = String(formData.get('source_url') ?? '').trim();
  if (!name || !cron_expr) {
    return { status: 'error', message: 'name + cron expression required' };
  }
  const args: Record<string, unknown> = {};
  if (target_platform === 'tiktok' || target_platform === 'facebook') {
    args.target_platform = target_platform;
  }
  if (caption) args.caption = caption;
  if (source_url) args.source_url = source_url;
  try {
    const res = await createSchedule({ name, cron_expr, args, enabled: true });
    revalidatePath('/scheduler');
    return {
      status: 'success',
      message: `Created "${res.schedule.name}" — next run ${new Date(res.schedule.next_run_at).toISOString()}`,
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleScheduleAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  const enabledRaw = String(formData.get('enabled') ?? 'false');
  if (!id) return;
  await updateSchedule({ id, enabled: enabledRaw !== 'true' });
  revalidatePath('/scheduler');
}

export async function deleteScheduleAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await deleteSchedule(id);
  revalidatePath('/scheduler');
}

export async function runNowAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  await runScheduleNow(id);
  revalidatePath('/scheduler');
}
