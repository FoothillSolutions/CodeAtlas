import { tokenizeLine } from '../syntax/highlighter';
import { colors } from '../theme/tokens';

interface CodeLineProps {
  lineNum: number;
  text: string;
  diffType: string;
  language: string;
  wrap?: boolean;
}

export function CodeLine({ lineNum, text, diffType, language, wrap }: CodeLineProps) {
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
        background: isAdd ? colors.diff.addBgSubtle
          : isRemove ? colors.diff.removeBgSubtle
          : 'transparent',
      }}
    >
      {/* Diff marker */}
      <span style={{
        width: '16px',
        flexShrink: 0,
        textAlign: 'center',
        color: isAdd ? colors.diff.addText : isRemove ? colors.diff.removeText : 'transparent',
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
        color: colors.text.muted,
        userSelect: 'none',
        fontSize: '11px',
      }}>
        {lineNum > 0 ? lineNum : ''}
      </span>

      <span style={{
        whiteSpace: wrap ? 'pre-wrap' : 'pre',
        wordBreak: wrap ? 'break-all' : undefined,
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
