import type { AiAccess, KeyCheckResult, ScoutProvider } from '../ai/types.ts';

export function aiHeaders(access: AiAccess): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.set('X-Aegis-Jev-Funding', access.jevFunding);
  headers.set('X-Aegis-Agent-Funding', access.agentFunding);
  if (access.jevFunding === 'byok') headers.set('X-Aegis-Jev-Key', access.jevKey.trim());
  if (access.agentFunding === 'byok') {
    headers.set('X-Aegis-Agent-Provider', access.agentProvider);
    headers.set('X-Aegis-Agent-Key', access.agentKey.trim());
  }
  return headers;
}

export async function checkScoutKey(
  provider: ScoutProvider,
  key: string,
  signal?: AbortSignal
): Promise<KeyCheckResult> {
  const response = await fetch('/api/agent/key-check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Aegis-Agent-Funding': 'byok',
      'X-Aegis-Agent-Provider': provider,
      'X-Aegis-Agent-Key': key.trim(),
    },
    body: '{}',
    credentials: 'same-origin',
    signal,
  });
  const result = await response.json().catch(() => null);
  if (
    result &&
    typeof result === 'object' &&
    result.provider === provider &&
    (result.status !== 'accepted' || response.ok) &&
    ['accepted', 'rejected', 'rate_limited', 'unavailable', 'model_unavailable'].includes(
      result.status
    ) &&
    result.generationVerified === false &&
    typeof result.message === 'string' &&
    typeof result.model === 'string' &&
    Number.isFinite(result.checkedAt)
  )
    return result;
  throw new Error('The key check could not be completed. Try again when the gateway is available.');
}

export async function inferenceApi<T>(
  path: string,
  value?: unknown,
  access?: AiAccess
): Promise<T> {
  const controller = path === '/api/agent' ? new AbortController() : undefined;
  const timeout = controller ? setTimeout(() => controller.abort(), 120_000) : undefined;
  try {
    const response = await fetch(path, {
      method: value === undefined ? 'GET' : 'POST',
      headers: access ? aiHeaders(access) : { 'Content-Type': 'application/json' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      credentials: 'same-origin',
      ...(controller ? { signal: controller.signal } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  } catch (error) {
    if (controller?.signal.aborted)
      throw new Error(
        'Scout took too long to respond. No action was approved. The server request may still be running; avoid immediately retrying.'
      );
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
