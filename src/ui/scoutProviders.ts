import type { ScoutProvider } from '../ai/types.ts';

export const scoutProviders: Record<
  ScoutProvider,
  { label: string; keyLabel: string; note?: string }
> = {
  mistral: { label: 'Mistral', keyLabel: 'Mistral API key' },
  openai: { label: 'OpenAI', keyLabel: 'OpenAI API key' },
  anthropic: {
    label: 'Anthropic',
    keyLabel: 'Anthropic API key',
    note: 'Use an API key scoped to one Claude workspace.',
  },
  google: { label: 'Google', keyLabel: 'Google AI Studio API key' },
};
