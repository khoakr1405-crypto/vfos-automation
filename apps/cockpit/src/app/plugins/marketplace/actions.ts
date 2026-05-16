'use server';

import { revalidatePath } from 'next/cache';
import { installPlugin, uninstallPlugin, updatePluginConfig } from '@/lib/kernel';

export interface ConfigState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  reloaded?: boolean;
  name?: string;
}

export async function updateConfigAction(
  _prev: ConfigState,
  formData: FormData,
): Promise<ConfigState> {
  const name = String(formData.get('name') ?? '').trim();
  const json = String(formData.get('config') ?? '').trim();
  if (!name) return { status: 'error', message: 'plugin name missing' };
  let parsed: Record<string, unknown>;
  try {
    parsed = json ? (JSON.parse(json) as Record<string, unknown>) : {};
  } catch (err) {
    return { status: 'error', message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { status: 'error', message: 'config must be a JSON object' };
  }
  try {
    const res = await updatePluginConfig({ name, config: parsed });
    revalidatePath('/plugins/marketplace');
    revalidatePath('/plugins');
    return {
      status: 'success',
      name: res.name,
      reloaded: res.reloaded,
      message: res.reloaded ? 'Config saved · agent reloaded' : 'Config saved · plugin not currently loaded',
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export async function installPluginAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await installPlugin(name);
  revalidatePath('/plugins/marketplace');
  revalidatePath('/plugins');
}

export async function uninstallPluginAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;
  await uninstallPlugin(name);
  revalidatePath('/plugins/marketplace');
  revalidatePath('/plugins');
}
