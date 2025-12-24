"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { CodeEditor } from "@/components/code-editor";
import { CRTScreen } from "@/components/crt-screen";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GlitchText } from "@/components/glitch-text";
import { Typewriter } from "@/components/typewriter";
import {
  ArrowRight,
  Upload,
  Download,
  Copy,
  Check,
  AlertCircle,
  Zap,
  Loader2,
  Github,
  ExternalLink,
  Terminal,
} from "lucide-react";
import { generateInngestCode } from "@/lib/converter";

const SAMPLE_WORKFLOW = {
  name: "Sample Data Pipeline",
  nodes: [
    {
      id: "1",
      name: "Schedule Trigger",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [250, 300] as [number, number],
      parameters: {
        rule: { interval: [{ field: "hours", hoursInterval: 1 }] },
      },
    },
    {
      id: "2",
      name: "Fetch Data",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [450, 300] as [number, number],
      parameters: {
        url: "https://api.example.com/data",
        method: "GET",
      },
    },
    {
      id: "3",
      name: "Process Data",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [650, 300] as [number, number],
      parameters: {
        jsCode: "return items.map(item => ({ ...item, processed: true }));",
      },
    },
  ],
  connections: {
    "Schedule Trigger": {
      main: [[{ node: "Fetch Data", type: "main", index: 0 }]],
    },
    "Fetch Data": {
      main: [[{ node: "Process Data", type: "main", index: 0 }]],
    },
  },
};

export default function Home() {
  const [inputJson, setInputJson] = useState(JSON.stringify(SAMPLE_WORKFLOW, null, 2));
  const [outputCode, setOutputCode] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [envVars, setEnvVars] = useState<string[]>([]);
  const [includeComments, setIncludeComments] = useState(true);
  const [useAgentKit, setUseAgentKit] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const convertBtnRef = useRef<HTMLButtonElement>(null);

  // GSAP entrance animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from("[data-animate='header']", {
        y: -30,
        opacity: 0,
        duration: 0.8,
      })
        .from("[data-animate='title']", {
          y: 60,
          opacity: 0,
          duration: 1,
        }, "-=0.4")
        .from("[data-animate='subtitle']", {
          y: 20,
          opacity: 0,
          duration: 0.6,
        }, "-=0.6")
        .from("[data-animate='panel-left']", {
          x: -60,
          opacity: 0,
          duration: 0.8,
        }, "-=0.4")
        .from("[data-animate='panel-right']", {
          x: 60,
          opacity: 0,
          duration: 0.8,
        }, "-=0.7")
        .from("[data-animate='options']", {
          y: 30,
          opacity: 0,
          duration: 0.6,
        }, "-=0.4")
        .from("[data-animate='footer']", {
          opacity: 0,
          duration: 0.5,
        }, "-=0.2");
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Magnetic button effect
  useEffect(() => {
    const btn = convertBtnRef.current;
    if (!btn) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      gsap.to(btn, { x: x * 0.2, y: y * 0.2, duration: 0.3, ease: "power2.out" });
    };

    const handleMouseLeave = () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
    };

    btn.addEventListener("mousemove", handleMouseMove);
    btn.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      btn.removeEventListener("mousemove", handleMouseMove);
      btn.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  const handleConvert = useCallback(async () => {
    setIsConverting(true);
    setError(null);
    setWarnings([]);

    // Animate button press
    if (convertBtnRef.current) {
      gsap.timeline()
        .to(convertBtnRef.current, { scale: 0.95, duration: 0.1 })
        .to(convertBtnRef.current, { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.5)" });
    }

    try {
      const workflow = JSON.parse(inputJson);
      const result = generateInngestCode(workflow, {
        includeComments,
        eventPrefix: "app",
        useAgentKit,
      });

      setOutputCode(result.code);
      setWarnings(result.warnings);
      setEnvVars(result.envVars);

      // Success animation on output panel
      gsap.from("[data-animate='panel-right']", {
        scale: 0.98,
        duration: 0.3,
        ease: "power2.out",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to convert workflow");
      setOutputCode("");
    } finally {
      setIsConverting(false);
    }
  }, [inputJson, includeComments, useAgentKit]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(outputCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [outputCode]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([outputCode], { type: "text/typescript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inngest-functions.ts";
    a.click();
    URL.revokeObjectURL(url);
  }, [outputCode]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        setInputJson(JSON.stringify(parsed, null, 2));
        setError(null);
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col">
      {/* Header */}
      <header data-animate="header" className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-matrix/20">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-matrix animate-pulse shadow-[0_0_10px_rgba(0,255,0,0.5)]" />
            <span className="text-sm font-mono text-matrix/80">[SYSTEM:ACTIVE]</span>
          </div>
          <nav className="flex items-center gap-6">
            <a
              href="https://inngest.com/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-muted-foreground hover:text-matrix transition-colors"
            >
              ./docs
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-matrix transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 pt-32 pb-24 px-6 lg:px-12">
        <div className="max-w-[1800px] mx-auto">
          {/* Hero Section */}
          <div className="mb-16 max-w-3xl">
            <div data-animate="title" className="mb-6">
              <div className="text-sm font-mono text-matrix mb-2 opacity-70 flex items-center gap-1">
                <Typewriter text="$ convert --workflow --target=inngest" speed={40} cursor={true} />
              </div>
              <h1 className="text-display flex items-center gap-4">
                <GlitchText
                  text="n8n"
                  className="text-matrix"
                  glitchOnHover={true}
                />
                <span className="text-muted-foreground font-mono">→</span>
                <GlitchText
                  text="Inngest"
                  className="text-cyber"
                  glitchOnHover={true}
                />
              </h1>
            </div>
            <p data-animate="subtitle" className="text-body-large text-muted-foreground max-w-xl font-mono">
              <span className="text-matrix/70">//</span> Transform workflows into production-ready TypeScript.
              <br />
              <span className="text-matrix/70">//</span> Durable execution. Auto-retries. Built for scale.
            </p>
          </div>

          {/* Editor Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-8">
            {/* Input Panel */}
            <div data-animate="panel-left" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-matrix animate-pulse" />
                  <span className="text-sm font-mono tracking-wide uppercase text-matrix/80">
                    input.json
                  </span>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Upload JSON
                    </span>
                  </Button>
                </label>
              </div>
              <div className="rounded-lg overflow-hidden border border-matrix/30 bg-black/50 backdrop-blur shadow-[0_0_30px_rgba(0,255,0,0.1)]">
                <CRTScreen color="green">
                  <CodeEditor
                    value={inputJson}
                    onChange={setInputJson}
                    language="json"
                    height="500px"
                  />
                </CRTScreen>
              </div>
            </div>

            {/* Output Panel */}
            <div data-animate="panel-right" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-cyber animate-pulse" />
                  <span className="text-sm font-mono tracking-wide uppercase text-cyber/80">
                    output.ts
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!outputCode}
                    className="font-mono text-muted-foreground hover:text-cyber"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 mr-2 text-matrix" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    {copied ? "COPIED" : "COPY"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!outputCode}
                    className="font-mono text-muted-foreground hover:text-cyber"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    SAVE
                  </Button>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-cyber/30 bg-black/50 backdrop-blur shadow-[0_0_30px_rgba(0,255,255,0.1)]">
                <CRTScreen color="cyan">
                  <CodeEditor
                    value={outputCode || "// AWAITING INPUT..."}
                    language="typescript"
                    readOnly
                    height="500px"
                  />
                </CRTScreen>
              </div>
            </div>
          </div>

          {/* Options & Convert */}
          <div data-animate="options" className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 py-6 border-t border-border/30">
            <div className="flex flex-wrap items-center gap-8">
              <div className="flex items-center gap-3">
                <Switch
                  id="comments"
                  checked={includeComments}
                  onCheckedChange={setIncludeComments}
                />
                <Label htmlFor="comments" className="text-sm text-muted-foreground cursor-pointer">
                  Include comments
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  id="agentkit"
                  checked={useAgentKit}
                  onCheckedChange={setUseAgentKit}
                />
                <Label htmlFor="agentkit" className="text-sm text-muted-foreground cursor-pointer">
                  Use AgentKit for AI
                </Label>
              </div>
            </div>

            <Button
              ref={convertBtnRef}
              size="lg"
              onClick={handleConvert}
              disabled={isConverting}
              className="bg-matrix hover:bg-matrix-light text-background font-mono font-bold px-8 h-12 rounded-md border border-matrix/50 shadow-[0_0_20px_rgba(0,255,0,0.3)] hover:shadow-[0_0_30px_rgba(0,255,0,0.5)] transition-all duration-300"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  EXECUTE
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>

          {/* Status Messages */}
          {(error || warnings.length > 0 || envVars.length > 0) && (
            <div className="mt-8 space-y-4">
              {error && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                  <span className="text-sm text-destructive">{error}</span>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium text-yellow-500">Warnings</span>
                  </div>
                  <ul className="space-y-1">
                    {warnings.map((warning, i) => (
                      <li key={i} className="text-sm text-yellow-400/80 pl-6">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {envVars.length > 0 && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-primary">Required Environment Variables</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {envVars.map((envVar, i) => (
                      <Badge key={i} variant="outline" className="font-mono text-xs bg-primary/5">
                        {envVar}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer data-animate="footer" className="border-t border-matrix/20">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-12 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm font-mono text-muted-foreground">
              <span className="text-matrix/50">/*</span> Built for developers who value reliability <span className="text-matrix/50">*/</span>
            </p>
            <div className="flex items-center gap-6 font-mono text-sm">
              <a
                href="https://inngest.com/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-cyber transition-colors flex items-center gap-1"
              >
                inngest://docs
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://docs.n8n.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-matrix transition-colors flex items-center gap-1"
              >
                n8n://docs
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
