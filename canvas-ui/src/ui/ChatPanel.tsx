import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import {
  chatPanelOpen,
  messages,
  isStreaming,
  proxyStatus,
  proxyClaudeBin,
  chatInput,
  sendMessage,
  toggleChatPanel,
  clearChatHistory,
  checkProxyHealth,
  loadChatHistory,
  type ChatMessage,
} from '../state/chat-store';
import { graphData } from '../state/graph-store';
import { selectedNodeId } from '../state/ui-store';
import {
  buildSystemPrompt,
  attachFileDiffToUserMessage,
  findFileById,
} from '../utils/chat-context';
import { colors, fonts, fontStrings } from '../theme/tokens';

const PANEL_WIDTH = 400;

export function ChatPanel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadChatHistory();
    void checkProxyHealth();
  }, []);

  useEffect(() => {
    if (chatPanelOpen.value && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  if (!chatPanelOpen.value) return null;

  const status = proxyStatus.value;
  const selectedFile = findFileById(graphData.value, selectedNodeId.value);

  function handleSend(attachDiff: boolean) {
    const text = chatInput.value.trim();
    if (!text || isStreaming.value) return;
    const system = buildSystemPrompt(graphData.value);
    const userText = attachDiff
      ? attachFileDiffToUserMessage(text, selectedFile)
      : text;
    chatInput.value = '';
    void sendMessage(userText, system, attachDiff ? selectedFile?.id : undefined);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e.metaKey || e.ctrlKey);
    }
  }

  return (
    <div style={styles.panelContainer}>
      <Header status={status} claudeBin={proxyClaudeBin.value} />
      <div ref={scrollRef} style={styles.messagesContainer}>
        {messages.value.length === 0 ? (
          <EmptyState selectedFileName={selectedFile?.fileName ?? null} />
        ) : (
          messages.value.map((m, i) => <Bubble key={i} message={m} />)
        )}
      </div>
      <Composer
        inputRef={inputRef}
        selectedFile={selectedFile}
        status={status}
        onKeyDown={handleKeyDown}
        onSend={handleSend}
      />
    </div>
  );
}

function Header({ status, claudeBin }: { status: string; claudeBin: string | null }) {
  const statusColor =
    status === 'ok' ? colors.review.reviewed
      : status === 'unavailable' ? colors.review.flagged
      : colors.text.muted;
  const statusLabel =
    status === 'ok' ? `claude ready`
      : status === 'unavailable' ? 'proxy offline'
      : status === 'checking' ? 'checking…'
      : '–';

  return (
    <div style={styles.header}>
      <div style={styles.headerTitle}>
        AI Review Chat
      </div>
      <div
        title={claudeBin ?? ''}
        style={getStatusIndicatorStyle(statusColor)}
      >
        ● {statusLabel}
      </div>
      <IconButton title="Clear history" onClick={clearChatHistory}>⌫</IconButton>
      <IconButton title="Close (a)" onClick={toggleChatPanel}>×</IconButton>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: preact.ComponentChildren;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={styles.iconButton}
    >
      {children}
    </button>
  );
}

function EmptyState({ selectedFileName }: { selectedFileName: string | null }) {
  return (
    <div style={styles.emptyStateContainer}>
      Ask anything about this MR. The assistant has the full dependency graph.
      <br /><br />
      <strong style={styles.emptyStateStrong}>Try:</strong>
      <ul style={styles.emptyStateList}>
        <li>What is the overall risk of this MR?</li>
        <li>Which files have the highest impact?</li>
        <li>Are there obvious missing tests?</li>
      </ul>
      <br />
      <span style={styles.emptyStateTip}>
        Tip: <kbd style={styles.kbd}>⌘ Enter</kbd> attaches the diff of{' '}
        <code style={styles.emptyStateCode}>
          {selectedFileName ?? 'the selected file'}
        </code>.
      </span>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <div style={getBubbleStyle(isUser)}>
      {message.content || (
        <span style={styles.bubblePlaceholder}>…</span>
      )}
    </div>
  );
}

interface ComposerProps {
  inputRef: preact.RefObject<HTMLTextAreaElement>;
  selectedFile: ReturnType<typeof findFileById>;
  status: string;
  onKeyDown: (e: KeyboardEvent) => void;
  onSend: (attachDiff: boolean) => void;
}

function Composer({ inputRef, selectedFile, status, onKeyDown, onSend }: ComposerProps) {
  const disabled = status !== 'ok' || isStreaming.value;
  return (
    <div style={styles.composerContainer}>
      <textarea
        ref={inputRef}
        value={chatInput.value}
        onInput={(e) => (chatInput.value = (e.target as HTMLTextAreaElement).value)}
        onKeyDown={onKeyDown}
        rows={3}
        placeholder={
          status === 'ok'
            ? 'Ask about this MR…  (Enter to send, ⌘Enter attaches selected file diff)'
            : status === 'unavailable'
              ? 'Proxy offline. Run: python3 codeatlas-chat-proxy.py'
              : 'Checking proxy…'
        }
        disabled={disabled && status !== 'ok'}
        style={styles.textarea}
      />
      <div style={styles.composerFooter}>
        <div style={styles.selectedFileIndicator}>
          {selectedFile
            ? <>Selected: <code style={styles.selectedFileCode}>{selectedFile.fileName}</code></>
            : 'No file selected'}
        </div>
        <button
          onClick={() => onSend(true)}
          disabled={disabled || !selectedFile}
          title="Send with attached diff of selected file (⌘Enter)"
          style={getButtonSecondaryStyle(disabled || !selectedFile)}
        >
          + diff
        </button>
        <button
          onClick={() => onSend(false)}
          disabled={disabled}
          style={getButtonPrimaryStyle(disabled)}
        >
          {isStreaming.value ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

const getStatusIndicatorStyle = (statusColor: string): JSX.CSSProperties => ({
  fontSize: '11px',
  color: statusColor,
  fontFamily: fonts.mono,
});

const getBubbleStyle = (isUser: boolean): JSX.CSSProperties => ({
  alignSelf: isUser ? 'flex-end' : 'flex-start',
  maxWidth: '92%',
  background: isUser ? colors.selection.activeBg : colors.bg.tertiary,
  border: `1px solid ${isUser ? colors.selection.activeBorder : colors.border.default}`,
  color: colors.text.primary,
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '13px',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: fonts.ui,
});

const getButtonPrimaryStyle = (disabled: boolean): JSX.CSSProperties => ({
  background: disabled ? colors.bg.tertiary : colors.selection.activeBorder,
  border: `1px solid ${colors.selection.activeBorder}`,
  color: disabled ? colors.text.muted : colors.text.primary,
  borderRadius: '6px',
  padding: '6px 14px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: fonts.ui,
});

const getButtonSecondaryStyle = (disabled: boolean): JSX.CSSProperties => ({
  background: 'transparent',
  border: `1px solid ${colors.border.default}`,
  color: disabled ? colors.text.muted : colors.text.secondary,
  borderRadius: '6px',
  padding: '6px 10px',
  fontSize: '12px',
  cursor: disabled ? 'default' : 'pointer',
  fontFamily: fonts.ui,
});

const styles = {
  panelContainer: {
    position: 'fixed',
    top: '44px',
    right: 0,
    bottom: 0,
    width: `${PANEL_WIDTH}px`,
    background: colors.bg.primary,
    borderLeft: `1px solid ${colors.border.default}`,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 200,
    fontFamily: fonts.ui,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border.default}`,
    background: colors.bg.secondary,
  },
  headerTitle: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 600,
    color: colors.text.primary,
  },
  iconButton: {
    background: 'transparent',
    border: `1px solid ${colors.border.default}`,
    color: colors.text.secondary,
    borderRadius: '4px',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    font: fontStrings.ui12,
    padding: 0,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  emptyStateContainer: {
    color: colors.text.tertiary,
    fontSize: '13px',
    lineHeight: 1.6,
    padding: '8px',
  },
  emptyStateStrong: {
    color: colors.text.secondary,
  },
  emptyStateList: {
    margin: '6px 0 0 18px',
    padding: 0,
  },
  emptyStateTip: {
    color: colors.text.muted,
    fontSize: '12px',
  },
  emptyStateCode: {
    color: colors.selection.activeText,
  },
  kbd: {
    background: colors.bg.tertiary,
    border: `1px solid ${colors.border.default}`,
    borderRadius: '3px',
    padding: '0 4px',
    fontFamily: fonts.mono,
    fontSize: '11px',
  },
  bubblePlaceholder: {
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  composerContainer: {
    borderTop: `1px solid ${colors.border.default}`,
    padding: '10px 12px',
    background: colors.bg.secondary,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  textarea: {
    background: colors.bg.canvas,
    border: `1px solid ${colors.border.default}`,
    color: colors.text.primary,
    borderRadius: '6px',
    padding: '8px',
    fontSize: '13px',
    fontFamily: fonts.ui,
    resize: 'vertical',
    minHeight: '60px',
    outline: 'none',
  },
  composerFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectedFileIndicator: {
    flex: 1,
    fontSize: '11px',
    color: colors.text.muted,
  },
  selectedFileCode: {
    color: colors.selection.activeText,
  },
} as const satisfies Record<string, JSX.CSSProperties>;
