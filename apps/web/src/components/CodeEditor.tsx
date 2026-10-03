'use client';

import Editor from '@monaco-editor/react';
import type { Language } from '@heist/shared';

type Props = {
  value: string;
  language: Language;
  disabled: boolean;
  onChange: (next: string) => void;
};

/** Plain editor. Effect overlays (blackout) are composed over it by the page. */
export function CodeEditor({ value, language, disabled, onChange }: Props) {
  return (
    <Editor
      height="100%"
      theme="git-money"
      beforeMount={(monaco) => monaco.editor.defineTheme('git-money', {
        base: 'vs-dark', inherit: true,
        rules: [
          { token: 'comment', foreground: '8D819F' },
          { token: 'keyword', foreground: 'FFAE00' },
          { token: 'string', foreground: 'C5D7AE' },
          { token: 'number', foreground: 'F89306' },
        ],
        colors: {
          'editor.background': '#100D20', 'editor.foreground': '#F5EEE0',
          'editorLineNumber.foreground': '#6A5C7A', 'editorLineNumber.activeForeground': '#FFAE00',
          'editorCursor.foreground': '#FFAE00', 'editor.selectionBackground': '#F8930635',
          'editor.lineHighlightBackground': '#19142D', 'editor.inactiveSelectionBackground': '#2A2141',
          'editorWidget.background': '#19142D', 'editorWidget.border': '#4A3B53',
        },
      })}
      language={language === 'python' ? 'python' : 'javascript'}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        readOnly: disabled,
        minimap: { enabled: false },
        fontSize: 16,
        fontFamily: 'Ubuntu Mono, ui-monospace, Menlo, Consolas, monospace',
        scrollBeyondLastLine: false,
        tabSize: 4,
        padding: { top: 18, bottom: 18 },
        automaticLayout: true,
      }}
    />
  );
}
