"use client";

import { useRef, useEffect } from "react";
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: "json" | "typescript";
  readOnly?: boolean;
  height?: string;
}

export function CodeEditor({
  value,
  onChange,
  language,
  readOnly = false,
  height = "500px",
}: CodeEditorProps) {
  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={(value) => onChange?.(value || "")}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "none",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  );
}
