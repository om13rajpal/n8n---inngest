"use client";

import { useEffect, useState, useRef } from "react";

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  cursor?: boolean;
  onComplete?: () => void;
}

export function Typewriter({
  text,
  speed = 50,
  delay = 0,
  className = "",
  cursor = true,
  onComplete,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showCursor, setShowCursor] = useState(true);
  const indexRef = useRef(0);

  useEffect(() => {
    const startTyping = () => {
      setIsTyping(true);
      indexRef.current = 0;
      setDisplayText("");

      const typeInterval = setInterval(() => {
        if (indexRef.current < text.length) {
          setDisplayText(text.slice(0, indexRef.current + 1));
          indexRef.current++;
        } else {
          clearInterval(typeInterval);
          setIsTyping(false);
          onComplete?.();
        }
      }, speed);

      return () => clearInterval(typeInterval);
    };

    const timeoutId = setTimeout(startTyping, delay);
    return () => clearTimeout(timeoutId);
  }, [text, speed, delay, onComplete]);

  // Cursor blink effect
  useEffect(() => {
    if (!cursor) return;

    const blinkInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 530);

    return () => clearInterval(blinkInterval);
  }, [cursor]);

  return (
    <span className={className}>
      {displayText}
      {cursor && (
        <span
          className={`inline-block w-[2px] h-[1em] bg-matrix ml-1 align-middle transition-opacity duration-100 ${
            showCursor ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}

// Multi-line typewriter that types multiple lines sequentially
interface MultiLineTypewriterProps {
  lines: string[];
  speed?: number;
  lineDelay?: number;
  className?: string;
  lineClassName?: string;
}

export function MultiLineTypewriter({
  lines,
  speed = 30,
  lineDelay = 500,
  className = "",
  lineClassName = "",
}: MultiLineTypewriterProps) {
  const [currentLine, setCurrentLine] = useState(0);
  const [completedLines, setCompletedLines] = useState<string[]>([]);

  const handleLineComplete = () => {
    setCompletedLines((prev) => [...prev, lines[currentLine]]);
    setTimeout(() => {
      if (currentLine < lines.length - 1) {
        setCurrentLine((prev) => prev + 1);
      }
    }, lineDelay);
  };

  return (
    <div className={className}>
      {completedLines.map((line, i) => (
        <div key={i} className={lineClassName}>
          {line}
        </div>
      ))}
      {currentLine < lines.length && (
        <div className={lineClassName}>
          <Typewriter
            text={lines[currentLine]}
            speed={speed}
            onComplete={handleLineComplete}
            cursor={currentLine === lines.length - 1 || currentLine === completedLines.length}
          />
        </div>
      )}
    </div>
  );
}

// Terminal-style typewriter with prompt
interface TerminalTypewriterProps {
  commands: { prompt?: string; text: string; output?: string }[];
  speed?: number;
  className?: string;
}

export function TerminalTypewriter({
  commands,
  speed = 40,
  className = "",
}: TerminalTypewriterProps) {
  const [currentCommand, setCurrentCommand] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const [completedCommands, setCompletedCommands] = useState<typeof commands>([]);

  const handleCommandComplete = () => {
    const cmd = commands[currentCommand];
    if (cmd.output) {
      setShowOutput(true);
      setTimeout(() => {
        setCompletedCommands((prev) => [...prev, cmd]);
        setShowOutput(false);
        if (currentCommand < commands.length - 1) {
          setCurrentCommand((prev) => prev + 1);
        }
      }, 800);
    } else {
      setCompletedCommands((prev) => [...prev, cmd]);
      if (currentCommand < commands.length - 1) {
        setCurrentCommand((prev) => prev + 1);
      }
    }
  };

  return (
    <div className={`font-mono text-sm ${className}`}>
      {completedCommands.map((cmd, i) => (
        <div key={i} className="mb-1">
          <span className="text-matrix">{cmd.prompt || "$"}</span>{" "}
          <span className="text-foreground">{cmd.text}</span>
          {cmd.output && <div className="text-muted-foreground ml-4">{cmd.output}</div>}
        </div>
      ))}
      {currentCommand < commands.length && (
        <div className="mb-1">
          <span className="text-matrix">{commands[currentCommand].prompt || "$"}</span>{" "}
          <Typewriter
            text={commands[currentCommand].text}
            speed={speed}
            onComplete={handleCommandComplete}
            cursor={!showOutput}
          />
          {showOutput && commands[currentCommand].output && (
            <div className="text-muted-foreground ml-4 animate-fade-in">
              {commands[currentCommand].output}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
