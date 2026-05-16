'use client';

import { useActionState } from 'react';
import { updateConfigAction, type ConfigState } from './actions';
import type { PluginConfigField, PluginConfigSchema } from '@/lib/kernel';

const INITIAL: ConfigState = { status: 'idle' };

interface Props {
  name: string;
  initialConfig: Record<string, unknown>;
  schema?: PluginConfigSchema;
}

export function ConfigForm({ name, initialConfig, schema }: Props) {
  const [state, formAction, pending] = useActionState(updateConfigAction, INITIAL);
  const hasSchema = !!schema?.properties;

  return (
    <details className="rounded border border-neutral-800 bg-neutral-950/60">
      <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-wider text-neutral-400 hover:text-neutral-200">
        Config{' '}
        <span className="ml-1 text-neutral-600">
          ({Object.keys(initialConfig).length} key
          {Object.keys(initialConfig).length === 1 ? '' : 's'}
          {hasSchema ? ' · schema-validated' : ' · free-form'})
        </span>
      </summary>
      <form action={formAction} className="space-y-3 border-t border-neutral-800 p-3">
        <input type="hidden" name="name" value={name} />
        {hasSchema ? (
          <TypedFields schema={schema!} current={initialConfig} />
        ) : (
          <RawJsonField initialConfig={initialConfig} />
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-neutral-500">
            {hasSchema
              ? 'Fields validated server-side · agent reloads on save'
              : 'JSON object · agent reloads on save'}
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-emerald-700/60 px-3 py-1 text-[11px] uppercase text-emerald-100 transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Save config'}
          </button>
        </div>
        {state.status === 'error' && (state.name === name || state.name === undefined) && (
          <div className="rounded border border-rose-700/60 bg-rose-900/20 px-2 py-1 text-[11px] text-rose-300">
            {state.message}
          </div>
        )}
        {state.status === 'success' && state.name === name && (
          <div className="rounded border border-emerald-700/60 bg-emerald-900/20 px-2 py-1 text-[11px] text-emerald-200">
            {state.message}
          </div>
        )}
      </form>
    </details>
  );
}

function RawJsonField({ initialConfig }: { initialConfig: Record<string, unknown> }) {
  const pretty = JSON.stringify(initialConfig, null, 2);
  return (
    <textarea
      name="config"
      rows={Math.max(4, pretty.split('\n').length + 1)}
      defaultValue={pretty}
      spellCheck={false}
      className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1.5 font-mono text-[11px] text-emerald-200 focus:border-emerald-500 focus:outline-none"
    />
  );
}

/**
 * Each typed field writes to `config[<key>]` via a same-named pair of
 * hidden + visible inputs. We pack the whole object into a single
 * `config` JSON string just before submit by attaching an onSubmit hook
 * on the form parent. Simpler approach: each field has name `field.<k>`
 * and we re-assemble in a hidden `config` input updated via onChange.
 *
 * Simplest of all: drop a hidden `config` input that gets refreshed
 * from a `useState` map any time a field changes.
 */
function TypedFields({
  schema,
  current,
}: {
  schema: PluginConfigSchema;
  current: Record<string, unknown>;
}) {
  // Build the initial value map: stored value > schema default > empty.
  const initialMap: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(schema.properties)) {
    if (current[k] !== undefined) initialMap[k] = current[k];
    else if (f.default !== undefined) initialMap[k] = f.default;
  }
  // We render uncontrolled inputs and serialize on submit via FormData.
  // The action parses `config` as JSON, so we pack into a hidden field
  // that mirrors the typed inputs through a small client-side script.
  return (
    <div className="space-y-3">
      <input type="hidden" name="config" defaultValue={JSON.stringify(initialMap)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Object.entries(schema.properties).map(([key, field]) => (
          <FieldInput
            key={key}
            fieldKey={key}
            field={field}
            defaultValue={initialMap[key]}
          />
        ))}
      </div>
      <ClientSyncScript />
    </div>
  );
}

function FieldInput({
  fieldKey,
  field,
  defaultValue,
}: {
  fieldKey: string;
  field: PluginConfigField;
  defaultValue: unknown;
}) {
  const label = (
    <span className="text-[10px] uppercase tracking-wider text-neutral-400">
      {fieldKey}
      <span className="ml-1 normal-case text-neutral-600">({field.type})</span>
    </span>
  );
  const describe = field.description && (
    <span className="text-[10px] text-neutral-500">{field.description}</span>
  );
  const base =
    'rounded border border-neutral-800 bg-neutral-950 px-2 py-1 font-mono text-[11px] text-neutral-200 focus:border-emerald-500 focus:outline-none';

  if (field.type === 'boolean') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select data-config-key={fieldKey} defaultValue={String(defaultValue ?? false)} className={base}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        {describe}
      </label>
    );
  }
  if (field.type === 'string' && field.enum) {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select
          data-config-key={fieldKey}
          defaultValue={String(defaultValue ?? field.enum[0] ?? '')}
          className={base}
        >
          {field.enum.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {describe}
      </label>
    );
  }
  const isNumber = field.type === 'number' || field.type === 'integer';
  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type={isNumber ? 'number' : 'text'}
        data-config-key={fieldKey}
        defaultValue={defaultValue === undefined ? '' : String(defaultValue)}
        min={'minimum' in field ? field.minimum : undefined}
        max={'maximum' in field ? field.maximum : undefined}
        step={field.type === 'integer' ? 1 : 'any'}
        minLength={'minLength' in field ? field.minLength : undefined}
        maxLength={'maxLength' in field ? field.maxLength : undefined}
        className={base}
      />
      {describe}
    </label>
  );
}

/**
 * Wire each typed input back into the hidden `config` field as JSON on
 * change. The kernel still validates server-side — this is just so
 * react form actions ship the latest values.
 */
function ClientSyncScript() {
  // eslint-disable-next-line react/no-danger
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
(function(){
  function sync(form){
    var hidden=form.querySelector('input[name="config"]');
    if(!hidden) return;
    var out={};
    form.querySelectorAll('[data-config-key]').forEach(function(el){
      var k=el.getAttribute('data-config-key');
      var v=el.value;
      if(v==='') return;
      if(el.type==='number'){ out[k]=Number(v); return; }
      if(v==='true'){ out[k]=true; return; }
      if(v==='false'){ out[k]=false; return; }
      out[k]=v;
    });
    hidden.value=JSON.stringify(out);
  }
  document.querySelectorAll('form').forEach(function(f){
    if(f.dataset.cfgSyncBound) return;
    if(!f.querySelector('[data-config-key]')) return;
    f.dataset.cfgSyncBound='1';
    f.addEventListener('change', function(){ sync(f); });
    f.addEventListener('input', function(){ sync(f); });
  });
})();`,
      }}
    />
  );
}
