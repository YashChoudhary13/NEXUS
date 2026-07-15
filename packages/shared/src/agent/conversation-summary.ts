import type { RecoveryMessage } from './core/index.ts';

const MAX_MESSAGE_CHARS = 500;
const MAX_TRANSCRIPT_CHARS = 12_000;

export interface ConversationSummaryOptions {
  maxMessageChars?: number;
  maxTranscriptChars?: number;
}

export function buildConversationSummaryTranscript(
  messages: RecoveryMessage[],
  options?: ConversationSummaryOptions,
): string {
  const maxMessageChars = options?.maxMessageChars ?? MAX_MESSAGE_CHARS;
  const maxTranscriptChars = options?.maxTranscriptChars ?? MAX_TRANSCRIPT_CHARS;

  const transcript = messages
    .map((message) => `${message.type === 'user' ? 'User' : 'Assistant'}: ${message.content.slice(0, maxMessageChars)}`)
    .join('\n\n');

  return transcript.slice(0, maxTranscriptChars);
}

export function buildConversationSummaryPrompt(messages: RecoveryMessage[]): string | null {
  if (messages.length === 0) return null;

  const transcript = buildConversationSummaryTranscript(messages);
  if (!transcript) return null;

  return (
    'Summarize this conversation concisely. Preserve: key decisions, ongoing tasks, ' +
    `technical context, and the user's current goal. Be specific, not generic.\n\n${transcript}`
  );
}

/**
 * Build the compact context passed between two agents when a user continues a
 * session with another account/model. Unlike the generic recovery summary,
 * this prompt names the concrete implementation state the receiving agent
 * needs in order to resume work without rediscovering it.
 */
export function buildAgentHandoffSummaryPrompt(messages: RecoveryMessage[]): string | null {
  if (messages.length === 0) return null;

  const transcript = buildConversationSummaryTranscript(messages);
  if (!transcript) return null;

  return (
    'Create a concise agent handoff from this conversation. Preserve, when present: ' +
    'the user\'s current objective, work already completed, recent decisions and their rationale, ' +
    'remaining tasks, touched files, commands/tests and results, blockers, and current git/worktree state. ' +
    'Use factual bullets or short sections. Do not invent missing details.\n\n' + transcript
  );
}

export async function generateConversationSummary(
  messages: RecoveryMessage[],
  runMiniCompletion: (prompt: string) => Promise<string | null>,
): Promise<string | null> {
  const prompt = buildConversationSummaryPrompt(messages);
  if (!prompt) return null;
  return runMiniCompletion(prompt);
}

export async function generateAgentHandoffSummary(
  messages: RecoveryMessage[],
  runMiniCompletion: (prompt: string) => Promise<string | null>,
): Promise<string | null> {
  const prompt = buildAgentHandoffSummaryPrompt(messages);
  if (!prompt) return null;
  return runMiniCompletion(prompt);
}

export function buildTransferredSessionContext(summary: string): string {
  return `<session_transfer_summary>\nThis session continues from another session. The prior conversation was summarized before handoff.\nUse the summary below as prior context for the next turn.\n\n${summary}\n</session_transfer_summary>`;
}
