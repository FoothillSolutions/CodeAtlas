import { signal, computed } from '@preact/signals';
import { branchName, repoName } from './graph-store';

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  contextFileId?: string;
}

export type ProxyStatus = 'unknown' | 'checking' | 'ok' | 'unavailable';

export const PROXY_URL = 'http://127.0.0.1:7823';

export const chatPanelOpen = signal(false);
export const messages = signal<ChatMessage[]>([]);
export const isStreaming = signal(false);
export const proxyStatus = signal<ProxyStatus>('unknown');
export const proxyClaudeBin = signal<string | null>(null);
export const chatInput = signal('');

const storageKey = computed(() => `codeatlas-chat-${repoName.value}-${branchName.value}`);

export function loadChatHistory() {
  const raw = safeRead(storageKey.value);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (Array.isArray(parsed)) messages.value = parsed;
  } catch {
    messages.value = [];
  }
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveChatHistory() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(messages.value));
  } catch {
    proxyStatus.value = proxyStatus.value;
  }
}

export function clearChatHistory() {
  messages.value = [];
  saveChatHistory();
}

export function toggleChatPanel() {
  chatPanelOpen.value = !chatPanelOpen.value;
  if (chatPanelOpen.value && proxyStatus.value === 'unknown') {
    void checkProxyHealth();
  }
}

export async function checkProxyHealth(): Promise<void> {
  proxyStatus.value = 'checking';
  try {
    const res = await fetch(`${PROXY_URL}/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { ok: boolean; claude: string | null };
    proxyClaudeBin.value = body.claude;
    proxyStatus.value = body.ok && body.claude ? 'ok' : 'unavailable';
  } catch {
    proxyStatus.value = 'unavailable';
    proxyClaudeBin.value = null;
  }
}

function appendToLastAssistant(chunk: string) {
  const list = messages.value.slice();
  const last = list[list.length - 1];
  if (last && last.role === 'assistant') {
    list[list.length - 1] = { ...last, content: last.content + chunk };
    messages.value = list;
  }
}

export async function sendMessage(
  userText: string,
  system: string,
  contextFileId?: string,
): Promise<void> {
  if (!userText.trim() || isStreaming.value) return;

  const userMsg: ChatMessage = { role: 'user', content: userText.trim(), contextFileId };
  const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
  messages.value = [...messages.value, userMsg, assistantMsg];
  isStreaming.value = true;
  saveChatHistory();

  const payload = {
    system,
    messages: messages.value
      .slice(0, -1)
      .map(m => ({ role: m.role, content: m.content })),
  };

  try {
    const res = await fetch(`${PROXY_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok || !res.body) {
      const errText = res.body ? await res.text() : `HTTP ${res.status}`;
      appendToLastAssistant(`\n\n[error] ${errText}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      appendToLastAssistant(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendToLastAssistant(`\n\n[error] ${msg}`);
    proxyStatus.value = 'unavailable';
  } finally {
    isStreaming.value = false;
    saveChatHistory();
  }
}
