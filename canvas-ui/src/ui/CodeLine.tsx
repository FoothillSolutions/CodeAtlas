import { tokenizeLine } from '../syntax/highlighter';

interface CodeLineProps {
  lineNum: number;
  text: string;
  diffType: string; // "context" | "add" | "remove"
  language: string;
}

export function CodeLine({ lineNum, text, diffType, language }: CodeLineProps) {
  const tokens = tokenizeLine(text, language);
  const isAdd = diffType === 'add';
  const isRemove = diffType === 'remove';

  return (
    <div
      style={{
        display: 'flex',
        padding: '0 4px 0 4px',
        minHeight: '18px',
        alignItems: 'center',
        background: isAdd ? 'rgba(46,160,67,0.12)'
          : isRemove ? 'rgba(248,81,73,0.12)'
          : 'transparent',
      }}
    >
      {/* Diff marker */}
      <span style={{
        width: '16px',
        flexShrink: 0,
        textAlign: 'center',
        color: isAdd ? '#3fb950' : isRemove ? '#f85149' : 'transparent',
        fontSize: '11px',
        userSelect: 'none',
      }}>
        {isAdd ? '+' : isRemove ? '\u2212' : ' '}
      </span>

      {/* Line number */}
      <span style={{
        width: '36px',
        flexShrink: 0,
        textAlign: 'right',
        paddingRight: '8px',
        color: '#484f58',
        userSelect: 'none',
        fontSize: '11px',
      }}>
        {lineNum > 0 ? lineNum : ''}
      </span>

      {/* Code text with syntax highlighting -- NO truncation */}
      <span style={{
        whiteSpace: 'pre',
        flex: 1,
      }}>
        {tokens.map((tok, i) =>
          tok.className ? (
            <span key={i} class={tok.className}>{tok.text}</span>
          ) : (
            tok.text
          )
        )}
      </span>
    </div>
  );
}
