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
      theme="vs-dark"
      language={language === 'python' ? 'python' : 'javascript'}
      value={value}
      onChange={(next) => onChange(next ?? '')}
      options={{
        readOnly: disabled,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        scrollBeyondLastLine: false,
        tabSize: 4,
        automaticLayout: true,
      }}
    />
  );
}
