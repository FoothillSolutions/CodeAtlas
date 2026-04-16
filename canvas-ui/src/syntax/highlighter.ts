// syntax/highlighter.ts — regex-based syntax highlighting for multiple languages

export interface Token {
  text: string;
  className: string; // CSS class name, empty string for plain text
}

// ---------------------------------------------------------------------------
// Core tokenizer factory
// ---------------------------------------------------------------------------

function createTokenizer(
  pattern: RegExp,
  classifier: (match: RegExpExecArray) => string,
): (text: string) => Token[] {
  return (text: string) => {
    const tokens: Token[] = [];
    let last = 0;
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > last) {
        tokens.push({ text: text.slice(last, m.index), className: '' });
      }
      tokens.push({ text: m[0], className: classifier(m) });
      last = pattern.lastIndex;
    }
    if (last < text.length) {
      tokens.push({ text: text.slice(last), className: '' });
    }
    return tokens;
  };
}

// ---------------------------------------------------------------------------
// C#
// ---------------------------------------------------------------------------

const CS_KEYWORDS = new Set([
  'using', 'namespace', 'class', 'interface', 'public', 'private', 'protected',
  'internal', 'static', 'async', 'await', 'new', 'return', 'if', 'else', 'var',
  'out', 'is', 'not', 'null', 'true', 'false', 'void', 'int', 'long', 'string',
  'bool', 'readonly', 'sealed', 'abstract', 'virtual', 'override', 'partial',
  'record', 'struct', 'enum', 'delegate', 'event', 'throw', 'try', 'catch',
  'finally', 'foreach', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'default', 'typeof', 'nameof', 'this', 'base', 'where', 'in',
  'get', 'set', 'value',
]);

const csPattern = new RegExp(
  [
    '(\\/\\/.*$)',                        // group 1: line comment
    '("(?:[^"\\\\]|\\\\.)*")',            // group 2: string
    '(\\[\\w+(?:\\([^)]*\\))?\\])',       // group 3: attribute [Foo(...)]
    '(\\b\\d+\\b)',                       // group 4: number
    '(\\b[A-Z]\\w*\\b)',                  // group 5: type / interface (uppercase start)
    '(\\b[a-z]\\w*\\b)',                  // group 6: identifier (lowercase start — may be keyword)
  ].join('|'),
  'gm',
);

const tokenizeCSharp = createTokenizer(csPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-str';
  if (m[3]) return 't-attr';
  if (m[4]) return 't-num';
  if (m[5]) {
    // Interface pattern: starts with I followed by uppercase
    // Both interfaces and regular types get t-ty
    return 't-ty';
  }
  if (m[6]) {
    return CS_KEYWORDS.has(m[6]) ? 't-kw' : '';
  }
  return '';
});

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

const jsonPattern = new RegExp(
  [
    '("(?:[^"\\\\]|\\\\.)*"\\s*:)',      // group 1: property key with colon
    '("(?:[^"\\\\]|\\\\.)*")',            // group 2: string value
    '(\\b(?:true|false|null)\\b)',        // group 3: keyword
    '(-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b)', // group 4: number
  ].join('|'),
  'g',
);

const tokenizeJson = createTokenizer(jsonPattern, (m) => {
  if (m[1]) return 't-prop';
  if (m[2]) return 't-str';
  if (m[3]) return 't-kw';
  if (m[4]) return 't-num';
  return '';
});

// ---------------------------------------------------------------------------
// YAML
// ---------------------------------------------------------------------------

const yamlPattern = new RegExp(
  [
    '(#.*$)',                             // group 1: comment
    '(^\\s*[\\w.-]+\\s*:)',              // group 2: key: at line start
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // group 3: quoted string
    '(\\b(?:true|false|null|yes|no)\\b)', // group 4: keyword
    '(-?\\b\\d+(?:\\.\\d+)?\\b)',        // group 5: number
  ].join('|'),
  'gm',
);

const tokenizeYaml = createTokenizer(yamlPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-prop';
  if (m[3]) return 't-str';
  if (m[4]) return 't-kw';
  if (m[5]) return 't-num';
  return '';
});

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER',
  'DROP', 'TABLE', 'INDEX', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'NOT', 'IN',
  'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'GROUP', 'BY', 'ORDER',
  'HAVING', 'LIMIT', 'AS', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS', 'UNION',
  'ALL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'BEGIN', 'COMMIT', 'ROLLBACK', 'EXEC', 'DECLARE',
  'VARCHAR', 'INT', 'NVARCHAR', 'BIT', 'DATETIME', 'BIGINT',
]);

const sqlPattern = new RegExp(
  [
    '(--.*$)',                            // group 1: line comment
    '(\\/\\*[\\s\\S]*?\\*\\/)',           // group 2: block comment
    "('(?:[^'\\\\]|\\\\.)*')",            // group 3: string
    '(-?\\b\\d+(?:\\.\\d+)?\\b)',        // group 4: number
    '(\\b[A-Za-z_]\\w*\\b)',             // group 5: word (check against keywords)
  ].join('|'),
  'gm',
);

const tokenizeSql = createTokenizer(sqlPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-cm';
  if (m[3]) return 't-str';
  if (m[4]) return 't-num';
  if (m[5]) {
    return SQL_KEYWORDS.has(m[5].toUpperCase()) ? 't-kw' : '';
  }
  return '';
});

// ---------------------------------------------------------------------------
// XML / CSPROJ
// ---------------------------------------------------------------------------

const xmlPattern = new RegExp(
  [
    '(<!--[\\s\\S]*?-->)',               // group 1: comment
    '(<\\/?\\w[\\w.-]*)',                // group 2: opening/closing tag name
    '(\\/>|>)',                           // group 3: self-closing or closing bracket
    '(\\b[\\w.-]+\\s*=)',                // group 4: attribute name=
    '("(?:[^"\\\\]|\\\\.)*")',           // group 5: attribute string value
  ].join('|'),
  'g',
);

const tokenizeXml = createTokenizer(xmlPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-tag';
  if (m[3]) return 't-tag';
  if (m[4]) return 't-attr';
  if (m[5]) return 't-str';
  return '';
});

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'default', 'new', 'this',
  'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'try',
  'catch', 'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'true',
  'false', 'null', 'undefined', 'void',
]);

const jsPattern = new RegExp(
  [
    '(\\/\\/.*$)',                        // group 1: line comment
    '("(?:[^"\\\\]|\\\\.)*")',            // group 2: double-quoted string
    "('(?:[^'\\\\]|\\\\.)*')",            // group 3: single-quoted string
    '(`(?:[^`\\\\]|\\\\.)*`)',            // group 4: template literal
    '(\\b\\d+(?:\\.\\d+)?\\b)',          // group 5: number
    '(\\b[A-Z]\\w*\\b)',                  // group 6: type (uppercase start)
    '(\\b[a-z_$]\\w*\\b)',               // group 7: identifier (may be keyword)
  ].join('|'),
  'gm',
);

const tokenizeJs = createTokenizer(jsPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-str';
  if (m[3]) return 't-str';
  if (m[4]) return 't-str';
  if (m[5]) return 't-num';
  if (m[6]) return 't-ty';
  if (m[7]) {
    return JS_KEYWORDS.has(m[7]) ? 't-kw' : '';
  }
  return '';
});

// ---------------------------------------------------------------------------
// CSS / SCSS
// ---------------------------------------------------------------------------

const cssPattern = new RegExp(
  [
    '(\\/\\*[\\s\\S]*?\\*\\/)',           // group 1: block comment
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // group 2: strings
    '(-?\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr|ch|ex|vmin|vmax)?\\b)', // group 3: number with optional unit
    '([.#@][\\w-]+)',                     // group 4: selector / at-rule
    '(\\b[\\w-]+\\s*:)',                 // group 5: property:
  ].join('|'),
  'gm',
);

const tokenizeCss = createTokenizer(cssPattern, (m) => {
  if (m[1]) return 't-cm';
  if (m[2]) return 't-str';
  if (m[3]) return 't-num';
  if (m[4]) return 't-kw';
  if (m[5]) return 't-prop';
  return '';
});

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

const tokenizePython = createTokenizer(
  new RegExp(
    [
      `(#.*)`,                                           // comments
      `("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`, // strings
      `(\\b\\d+(?:\\.\\d+)?\\b)`,                        // numbers
      `(\\b(?:def|class|if|elif|else|for|while|return|import|from|with|as|try|except|finally|raise|yield|async|await|pass|break|continue|lambda|in|not|and|or|is|None|True|False|self|cls)\\b)`, // keywords
      `(@\\w+)`,                                         // decorators
      `(\\b(?:int|str|float|list|dict|tuple|set|bool|bytes|type|Optional|Union|Any|List|Dict|Tuple|Set|Callable)\\b)`, // types
    ].join('|'),
    'g'
  ),
  (m: RegExpExecArray) => {
    if (m[1]) return 't-cmt';
    if (m[2]) return 't-str';
    if (m[3]) return 't-num';
    if (m[4]) return 't-kw';
    if (m[5]) return 't-kw';
    if (m[6]) return 't-typ';
    return '';
  }
);

// ---------------------------------------------------------------------------
// TypeScript (extends JS with type keywords)
// ---------------------------------------------------------------------------

const tokenizeTypeScript = createTokenizer(
  new RegExp(
    [
      `(\\/\\/.*|\\/\\*[\\s\\S]*?\\*\\/)`,
      `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`,
      `(\\b\\d+(?:\\.\\d+)?\\b)`,
      `(\\b(?:import|export|from|const|let|var|function|return|if|else|for|while|class|extends|implements|new|this|super|async|await|try|catch|throw|typeof|instanceof|interface|type|enum|namespace|declare|abstract|readonly|public|private|protected|static|override|as|is|in|of|keyof|infer|never|void|null|undefined|true|false)\\b)`,
      `(\\b(?:string|number|boolean|any|unknown|object|Array|Promise|Record|Partial|Required|Omit|Pick|Map|Set)\\b)`,
    ].join('|'),
    'g'
  ),
  (m: RegExpExecArray) => {
    if (m[1]) return 't-cmt';
    if (m[2]) return 't-str';
    if (m[3]) return 't-num';
    if (m[4]) return 't-kw';
    if (m[5]) return 't-typ';
    return '';
  }
);

// ---------------------------------------------------------------------------
// TOML / Config
// ---------------------------------------------------------------------------

const tokenizeToml = createTokenizer(
  new RegExp(
    [
      `(#.*)`,
      `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`,
      `(\\b\\d+(?:\\.\\d+)?\\b)`,
      `(\\b(?:true|false)\\b)`,
      `(\\[[^\\]]+\\])`,
    ].join('|'),
    'g'
  ),
  (m: RegExpExecArray) => {
    if (m[1]) return 't-cmt';
    if (m[2]) return 't-str';
    if (m[3]) return 't-num';
    if (m[4]) return 't-kw';
    if (m[5]) return 't-prop';
    return '';
  }
);

// ---------------------------------------------------------------------------
// Markdown / Other — no highlighting
// ---------------------------------------------------------------------------

function tokenizePlain(text: string): Token[] {
  return text.length > 0 ? [{ text, className: '' }] : [];
}

// ---------------------------------------------------------------------------
// Language dispatcher
// ---------------------------------------------------------------------------

const tokenizers: Record<string, (text: string) => Token[]> = {
  csharp: tokenizeCSharp,
  python: tokenizePython,
  typescript: tokenizeTypeScript,
  json: tokenizeJson,
  yaml: tokenizeYaml,
  sql: tokenizeSql,
  xml: tokenizeXml,
  javascript: tokenizeJs,
  css: tokenizeCss,
  toml: tokenizeToml,
  config: tokenizeToml,
  markdown: tokenizePlain,
  plain: tokenizePlain,
  other: tokenizePlain,
};

export function tokenizeLine(text: string, language: string): Token[] {
  const tokenizer = tokenizers[language] ?? tokenizePlain;
  return tokenizer(text);
}
