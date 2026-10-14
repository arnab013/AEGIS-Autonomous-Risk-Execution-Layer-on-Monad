import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferenceApi } from '../src/ui/aiAccess.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Whole Scout request deadline', () => {
  it('releases the client after 120 seconds without automatically requesting again', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      (_path: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          );
        })
    );
    vi.stubGlobal('fetch', fetcher);
    let finished = false;
    const pending = inferenceApi('/api/agent', { message: 'Explain the market' }).then(
      () => {
        finished = true;
      },
      (error: Error) => {
        finished = true;
        return error;
      }
    );
    await vi.advanceTimersByTimeAsync(119_999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain('No action was approved');
    expect(error?.message).toContain('server request may still be running');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline after a reply, and does not add this deadline to approvals', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (_path: string, _options?: RequestInit) =>
        new Response(JSON.stringify({ message: 'Observed context' }))
    );
    vi.stubGlobal('fetch', fetcher);
    expect(await inferenceApi('/api/agent', { message: 'Explain the market' })).toEqual({
      message: 'Observed context',
    });
    const signal = fetcher.mock.calls[0][1]?.signal;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(signal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await inferenceApi('/api/agent/approve', { token: 'test-only-intent' });
    expect(fetcher.mock.calls[1][1]?.signal).toBeUndefined();
  });

  it('preserves provider error text with no retry or funding fallback', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'Provider quota unavailable' }), { status: 429 })
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(inferenceApi('/api/agent', { message: 'Explain the market' })).rejects.toThrow(
      'Provider quota unavailable'
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
