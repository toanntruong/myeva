import { invoke } from '@tauri-apps/api/core';
import { useChatStore } from '../store/chatStore';
import type { Message } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

interface AnthropicTextBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

interface Layer1Payload {
  model: string;
  max_tokens: number;
  system: AnthropicTextBlock[];
  messages: Message[];
}

export function buildMemorySystemBlock(memoryContent: string): AnthropicTextBlock[] {
  if (!memoryContent) return [];

  return [
    {
      type: 'text',
      text: `Đọc nội dung memory sau trước khi thực hiện yêu cầu:\n\n<memory>\n${memoryContent}\n</memory>`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

export function buildLayer1Payload(
  userPrompt: string,
  memoryContent: string,
  messages: Message[],
): Layer1Payload {
  return {
    model: MODEL,
    max_tokens: 1000,
    system: buildMemorySystemBlock(memoryContent),
    messages: [...messages, { role: 'user', content: userPrompt }],
  };
}

export function buildLayer1CliPrompt(
  userPrompt: string,
  memoryContent: string,
  messages: Message[],
): string {
  const sections: string[] = [];

  if (memoryContent) {
    sections.push(`Đọc nội dung memory sau trước khi thực hiện yêu cầu:\n\n<memory>\n${memoryContent}\n</memory>`);
  }

  if (messages.length > 0) {
    sections.push(
      `Lịch sử hội thoại Layer 1:\n${messages
        .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
        .join('\n')}`,
    );
  }

  sections.push(`Yêu cầu hiện tại của user:\n${userPrompt}`);
  return sections.join('\n\n---\n\n');
}

export async function sendLayer1Message(userPrompt: string): Promise<string> {
  const { messages, appendMessage } = useChatStore.getState();
  const memoryContent = await invoke<string>('read_memory_file');
  const payload = buildLayer1Payload(userPrompt, memoryContent, messages);

  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const apiKey = env?.VITE_ANTHROPIC_API_KEY;
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const assistantText = Array.isArray(data.content)
    ? data.content
        .filter((block: { type?: string }) => block.type === 'text')
        .map((block: { text?: string }) => block.text ?? '')
        .join('')
    : '';

  appendMessage({ role: 'user', content: userPrompt });
  appendMessage({ role: 'assistant', content: assistantText });

  return assistantText;
}
