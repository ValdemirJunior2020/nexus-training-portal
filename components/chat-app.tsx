"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BookOpen, Check, ChevronDown, Clipboard, GraduationCap, Menu, Moon,
  Plus, RefreshCw, Settings, ShieldCheck, Sparkles, Square, Sun, Trash2, X,
  Wrench, AlertTriangle, Brain, ThumbsUp, ThumbsDown, Save, Search,
} from "lucide-react";
import { MarkdownMessage } from "./markdown-message";
import { useChatStore } from "@/lib/store";
import type { ChatMessage, MessageStats } from "@/lib/types";

type AppMode = "chat" | "training" | "knowledge" | "logs";
type Health = { nexus?: { ok?: boolean }; llamaCpp?: { ok?: boolean }; deerflow?: { ok?: boolean }; activeProvider?: string | null };
type StreamEvent =
  | { type: "status"; message: string; progress?: number }
  | { type: "meta"; engine?: string; model?: string; agentsUsed?: string[]; toolsUsed?: string[] }
  | { type: "delta"; text: string }
  | { type: "stats"; stats: MessageStats }
  | { type: "done" }
  | { type: "error"; message: string };

type TrainingResult = {
  answer?: string; model?: string; verified?: boolean; rounds?: number;
  agents_used?: string[]; metadata?: { engine?: string; provider?: string; tools_used?: string[] };
};

type MemoryItem = { id: number; scope: string; user_id: string; kind: string; content: string; source: string; confidence: number; created_at?: string };
type MatrixMatch = { section?: string; issue?: string; instructions?: string; slack?: string; refund_queue?: string; create_ticket?: string; supervisor?: string; vipres?: string; match_score?: number };

const uid = () => crypto.randomUUID();

export function ChatApp() {
  const store = useChatStore();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<AppMode>("chat");
  const [models, setModels] = useState<string[]>([]);
  const [health, setHealth] = useState<Health>({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [input, setInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [progress, setProgress] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => store.conversations.find((c) => c.id === store.activeId) || store.conversations[0],
    [store.conversations, store.activeId]
  );

  const refreshStatus = useCallback(async () => {
    setLoadingModels(true);
    try {
      const [statusRes, modelsRes] = await Promise.all([fetch("/api/status"), fetch("/api/models")]);
      if (statusRes.ok) setHealth(await statusRes.json());
      const modelData = await modelsRes.json();
      const nextModels = Array.isArray(modelData.models) ? modelData.models : [];
      setModels(nextModels);
      if (!store.model && nextModels[0]) store.setModel(nextModels[0]);
      if (store.model && nextModels.length && !nextModels.includes(store.model)) store.setModel(nextModels[0]);
    } catch {
      setHealth({ nexus: { ok: false }, llamaCpp: { ok: false }, deerflow: { ok: false } });
      setModels([]);
    } finally { setLoadingModels(false); }
  }, [store.model, store.setModel]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (mounted) refreshStatus(); }, [mounted, refreshStatus]);
  useEffect(() => { if (mounted) document.documentElement.classList.toggle("dark", store.theme === "dark"); }, [mounted, store.theme]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [active?.messages, statusText]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current; if (!el) return; el.style.height = "0px"; el.style.height = `${Math.min(el.scrollHeight, 190)}px`;
  }, []);
  useEffect(autoGrow, [input, autoGrow]);

  const stopGeneration = () => { abortRef.current?.abort(); abortRef.current = null; setGenerating(false); setStatusText(""); setProgress(0); };

  const runChat = useCallback(async (prompt: string, baseMessages?: ChatMessage[]) => {
    const text = prompt.trim(); if (!text || generating || !active) return;
    const userMessage: ChatMessage = { id: uid(), role: "user", content: text, createdAt: Date.now() };
    const assistantId = uid();
    const assistantMessage: ChatMessage = { id: assistantId, role: "assistant", content: "", createdAt: Date.now() };
    const history = baseMessages ?? active.messages;
    store.appendMessage(userMessage); store.appendMessage(assistantMessage); setInput(""); setGenerating(true); setStatusText("Connecting to Nexus…"); setProgress(5);
    const controller = new AbortController(); abortRef.current = controller;
    let timer: ReturnType<typeof setInterval> | null = setInterval(() => setProgress((p) => p >= 88 ? p : p + (p < 35 ? 5 : p < 70 ? 2 : 1)), 900);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ messages: [...history, userMessage].map(({ role, content }) => ({ role, content })), model: store.model || null, sessionId: active.id, systemPrompt: store.systemPrompt, engine: store.engine === "ollama" ? "auto" : store.engine }) });
      if (!response.ok || !response.body) throw new Error(await response.text() || "Request failed");
      const reader = response.body.getReader(); const decoder = new TextDecoder("utf-8"); let buffer = ""; let fullText = ""; let stats: MessageStats = {};
      while (true) {
        const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const raw of lines) {
          if (!raw.trim()) continue; const event = JSON.parse(raw) as StreamEvent;
          if (event.type === "status") { setStatusText(event.message); if (typeof event.progress === "number") setProgress(event.progress); }
          if (event.type === "meta") { stats = { ...stats, engine: event.engine, model: event.model, agentsUsed: event.agentsUsed, toolsUsed: event.toolsUsed }; }
          if (event.type === "delta") { fullText += event.text; store.updateMessage(assistantId, { content: fullText, stats }); }
          if (event.type === "stats") { stats = { ...stats, ...event.stats }; store.updateMessage(assistantId, { stats }); }
          if (event.type === "error") throw new Error(event.message);
        }
      }
      if (!fullText) store.updateMessage(assistantId, { content: "No response was returned." });
      setProgress(100); setStatusText("Done"); setTimeout(() => { setProgress(0); setStatusText(""); }, 450);
    } catch (error) {
      if ((error as Error).name !== "AbortError") { const message = error instanceof Error ? error.message : "Request failed"; store.updateMessage(assistantId, { content: `⚠️ ${message}` }); setStatusText(""); setProgress(0); }
    } finally { if (timer) clearInterval(timer); timer = null; abortRef.current = null; setGenerating(false); }
  }, [active, generating, store]);

  const regenerate = async () => {
    if (!active || generating) return; const messages = active.messages; const lastAssistantIndex = [...messages].map((m) => m.role).lastIndexOf("assistant"); if (lastAssistantIndex < 0) return;
    const userBefore = [...messages.slice(0, lastAssistantIndex)].reverse().find((m) => m.role === "user"); if (!userBefore) return;
    const cleanHistory = messages.slice(0, messages.indexOf(userBefore)); store.clearActive(); for (const message of cleanHistory) store.appendMessage(message); await runChat(userBefore.content, cleanHistory);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setMode("chat"); store.newChat(); textareaRef.current?.focus(); }
      if (event.key === "Escape" && generating) stopGeneration();
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [generating, store]);

  if (!mounted || !active) return <div className="min-h-screen bg-[var(--bg)]" />;

  return (
    <main className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <Sidebar mobile={mobileSidebar} closeMobile={() => setMobileSidebar(false)} mode={mode} setMode={setMode} />
      <section className="relative flex min-w-0 flex-1 flex-col">
        <Header models={models} health={health} loading={loadingModels} retry={refreshStatus} openMobile={() => setMobileSidebar(true)} mode={mode} />
        {mode === "chat" && <>
          <div className="scrollbar flex-1 overflow-y-auto px-4 pb-44 pt-4 md:px-7">
            {active.messages.length === 0 ? <Welcome onPick={(text) => setInput(text)} /> : <div className="mx-auto w-full max-w-4xl space-y-7">
              {active.messages.map((message, index) => <MessageBubble key={message.id} message={message} copied={copiedId === message.id} onCopy={async () => { await navigator.clipboard.writeText(message.content); setCopiedId(message.id); setTimeout(() => setCopiedId(null), 1400); }} canRegenerate={message.role === "assistant" && index === active.messages.length - 1 && !generating} onRegenerate={regenerate} />)}
              {statusText && <ProgressStatus text={statusText} progress={progress} />}
              <div ref={bottomRef} />
            </div>}
          </div>
          <Composer input={input} setInput={setInput} submit={() => runChat(input)} generating={generating} stop={stopGeneration} textareaRef={textareaRef} />
        </>}
        {mode === "training" && <TrainingPortal />}
        {mode === "knowledge" && <KnowledgePortal />}
        {mode === "logs" && <LogsPortal />}
      </section>
      <SettingsPanel models={models} refresh={refreshStatus} />
    </main>
  );
}

function ProgressStatus({ text, progress }: { text: string; progress: number }) {
  return <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
    <div className="flex items-center gap-2 text-xs"><Sparkles size={14} className="animate-pulse"/><span>{text}</span><span className="ml-auto font-semibold">{Math.max(0, Math.min(100, Math.round(progress)))}%</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--chip)]"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500 transition-all duration-500" style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} /></div>
  </div>;
}

function Header({ models, health, loading, retry, openMobile, mode }: { models: string[]; health: Health; loading: boolean; retry: () => void; openMobile: () => void; mode: AppMode }) {
  const { model, setModel, engine, setEngine, theme, setTheme, setSettingsOpen } = useChatStore();
  const title = mode === "chat" ? "Nexus Local AI" : mode === "training" ? "Nexus Training" : mode === "knowledge" ? "Knowledge" : "Issue Logs";
  return <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[var(--line)] bg-[var(--bg)]/95 px-3 backdrop-blur md:px-5">
    <button onClick={openMobile} className="rounded-full p-2 hover:bg-[var(--chip)] md:hidden"><Menu size={20}/></button>
    <div className="flex min-w-0 items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-rose-500 text-white"><Sparkles size={17}/></div><div><div className="text-sm font-semibold">{title}</div><div className="hidden text-[11px] text-[var(--muted)] sm:block">HotelPlanner AI operator training workspace</div></div></div>
    <div className="ml-auto flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] px-2.5 py-1.5 text-xs lg:flex"><span className={`h-2 w-2 rounded-full ${health.nexus?.ok ? "bg-emerald-500" : "bg-red-500"}`}/> Nexus <span className={`h-2 w-2 rounded-full ${health.llamaCpp?.ok ? "bg-emerald-500" : "bg-red-500"}`}/> llama.cpp <span className={`h-2 w-2 rounded-full ${health.deerflow?.ok ? "bg-emerald-500" : "bg-amber-500"}`}/> DeerFlow {!health.nexus?.ok && <button onClick={retry} className="underline">Retry</button>}</div>
      {mode === "chat" && <><div className="relative hidden sm:block"><select value={engine === "ollama" ? "auto" : engine} onChange={(e) => setEngine(e.target.value as typeof engine)} className="appearance-none rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-3 pr-8 text-xs outline-none"><option value="auto">Nexus Auto</option><option value="nexus">Nexus Agent</option><option value="deerflow">DeerFlow</option></select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-[var(--muted)]"/></div>
      <div className="relative hidden max-w-56 md:block"><select value={model} disabled={loading || !models.length} onChange={(e) => setModel(e.target.value)} className="w-full appearance-none truncate rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-3 pr-8 text-xs outline-none"><option value="">{loading ? "Loading model…" : models.length ? "Default model" : "No llama.cpp model"}</option>{models.map((m) => <option key={m} value={m}>{m.split(/[\\/]/).pop()}</option>)}</select><ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-2.5 text-[var(--muted)]"/></div></>}
      <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-full p-2 hover:bg-[var(--chip)]">{theme === "dark" ? <Sun size={18}/> : <Moon size={18}/>}</button>
      <button onClick={() => setSettingsOpen(true)} className="rounded-full p-2 hover:bg-[var(--chip)]"><Settings size={18}/></button>
    </div>
  </header>;
}

function Sidebar({ mobile, closeMobile, mode, setMode }: { mobile: boolean; closeMobile: () => void; mode: AppMode; setMode: (m: AppMode) => void }) {
  const { conversations, activeId, selectChat, newChat, deleteChat, sidebarOpen, setSidebarOpen, setSettingsOpen } = useChatStore();
  const content = <aside className="flex h-full w-[286px] shrink-0 flex-col bg-[var(--panel)] p-3">
    <div className="flex items-center justify-between px-1 py-1"><button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden rounded-full p-2 hover:bg-[var(--chip)] md:block"><Menu size={19}/></button><button onClick={closeMobile} className="rounded-full p-2 hover:bg-[var(--chip)] md:hidden"><X size={19}/></button><span className="gemini-gradient text-sm font-bold">NEXUS</span></div>
    <div className="mt-3 space-y-1">
      <SideModeButton active={mode === "chat"} icon={<Sparkles size={17}/>} label="Chat" onClick={() => { setMode("chat"); closeMobile(); }}/>
      <SideModeButton active={mode === "training"} icon={<GraduationCap size={17}/>} label="Training" onClick={() => { setMode("training"); closeMobile(); }}/>
      <SideModeButton active={mode === "knowledge"} icon={<BookOpen size={17}/>} label="Knowledge" onClick={() => { setMode("knowledge"); closeMobile(); }}/>
      <SideModeButton active={mode === "logs"} icon={<AlertTriangle size={17}/>} label="Issue Logs" onClick={() => { setMode("logs"); closeMobile(); }}/>
    </div>
    {mode === "chat" && <><button onClick={() => { newChat(); closeMobile(); }} className="mt-4 flex items-center gap-3 rounded-2xl bg-[var(--chip)] px-4 py-3 text-sm font-medium"><Plus size={18}/> New chat <span className="ml-auto text-[10px] text-[var(--muted)]">Ctrl K</span></button><div className="mt-5 px-2 text-xs font-medium text-[var(--muted)]">Recent</div><div className="scrollbar mt-2 flex-1 space-y-1 overflow-y-auto">{conversations.map((chat) => <div key={chat.id} className={`group flex items-center rounded-xl ${chat.id === activeId ? "bg-[var(--chip)]" : "hover:bg-[var(--chip)]/70"}`}><button onClick={() => { selectChat(chat.id); closeMobile(); }} className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm">{chat.title}</button><button onClick={() => deleteChat(chat.id)} className="mr-1 hidden rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--panel-2)] group-hover:block"><Trash2 size={14}/></button></div>)}</div></>}
    {mode !== "chat" && <div className="flex-1"/>}
    <button onClick={() => setSettingsOpen(true)} className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-[var(--chip)]"><Settings size={17}/> Settings</button>
  </aside>;
  return <>{sidebarOpen && <div className="hidden md:block">{content}</div>}{mobile && <div className="fixed inset-0 z-40 md:hidden"><button className="absolute inset-0 bg-black/50" onClick={closeMobile}/><div className="relative h-full w-[286px]">{content}</div></div>}</>;
}

function SideModeButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${active ? "bg-[var(--chip)] font-medium" : "hover:bg-[var(--chip)]/70"}`}>{icon}{label}</button>;
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  const suggestions = ["Analyze a support scenario against the Ticket Matrix", "Help me research a current issue using Nexus tools", "Review a workflow for mistakes", "Explain what Nexus has learned so far"];
  return <div className="mx-auto flex min-h-[70vh] w-full max-w-4xl flex-col justify-center"><div className="mb-8 px-2"><div className="gemini-gradient text-4xl font-semibold tracking-tight md:text-5xl">Hello.</div><div className="mt-1 text-4xl font-semibold tracking-tight text-[var(--muted)] md:text-5xl">What should Nexus work on?</div></div><div className="grid gap-3 md:grid-cols-2">{suggestions.map((item, i) => <button key={item} onClick={() => onPick(item)} className="min-h-28 rounded-2xl bg-[var(--panel)] p-4 text-left text-sm leading-6 hover:bg-[var(--chip)]"><span className="mb-4 inline-grid h-8 w-8 place-items-center rounded-full bg-[var(--panel-2)]">{i === 0 ? <ShieldCheck size={16}/> : i === 1 ? <Wrench size={16}/> : <Sparkles size={16}/>}</span><div>{item}</div></button>)}</div></div>;
}

function MessageBubble({ message, copied, onCopy, canRegenerate, onRegenerate }: { message: ChatMessage; copied: boolean; onCopy: () => void; canRegenerate: boolean; onRegenerate: () => void }) {
  if (message.role === "user") return <div className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-[var(--user)] px-4 py-3 text-[15px] leading-6 md:max-w-[72%]">{message.content}</div></div>;
  const s = message.stats;
  return <div className="group flex gap-3"><div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-rose-500 text-white"><Sparkles size={15}/></div><div className="min-w-0 flex-1 pt-1">{message.content ? <MarkdownMessage content={message.content}/> : <div className="flex h-7 items-center gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)]"/><span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:120ms]"/><span className="h-2 w-2 animate-bounce rounded-full bg-[var(--muted)] [animation-delay:240ms]"/></div>}{!!message.content && <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--muted)]">{s?.engine && <span className="rounded-full bg-[var(--chip)] px-2 py-1">{s.engine}</span>}{s?.verified === true && <span className="flex items-center gap-1"><Check size={12}/> verified</span>}{!!s?.toolsUsed?.length && <span>• tools: {s.toolsUsed.join(", ")}</span>}</div>}{!!message.content && <div className="mt-2 flex gap-1 opacity-70 md:opacity-0 md:group-hover:opacity-100"><button onClick={onCopy} className="rounded-full p-2 hover:bg-[var(--chip)]">{copied ? <Check size={15}/> : <Clipboard size={15}/>}</button>{canRegenerate && <button onClick={onRegenerate} className="rounded-full p-2 hover:bg-[var(--chip)]"><RefreshCw size={15}/></button>}</div>}</div></div>;
}

function Composer({ input, setInput, submit, generating, stop, textareaRef }: { input: string; setInput: (v: string) => void; submit: () => void; generating: boolean; stop: () => void; textareaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  return <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent px-3 pb-3 pt-12 md:px-6 md:pb-5"><div className="pointer-events-auto mx-auto max-w-4xl"><div className="rounded-[28px] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-lg shadow-black/5"><textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} rows={1} placeholder="Ask Nexus anything" className="scrollbar max-h-48 min-h-12 w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-[var(--muted)]"/><div className="flex items-center gap-2 px-1 pb-1"><span className="text-[11px] text-[var(--muted)]">Enter to send · Shift+Enter for newline · Esc to stop</span><div className="ml-auto">{generating ? <button onClick={stop} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--text)] text-[var(--bg)]"><Square size={15} fill="currentColor"/></button> : <button onClick={submit} disabled={!input.trim()} className="grid h-10 w-10 place-items-center rounded-full bg-[var(--text)] text-[var(--bg)] disabled:opacity-30"><ArrowUp size={19}/></button>}</div></div></div><div className="mt-2 text-center text-[10px] text-[var(--muted)]">Nexus runs locally through llama.cpp. Company policy stays separate from learned corrections.</div></div></div>;
}

function TrainingPortal() {
  const [trainer, setTrainer] = useState("Junior"); const [caseText, setCaseText] = useState(""); const [result, setResult] = useState<TrainingResult | null>(null); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [stage, setStage] = useState(""); const [correction, setCorrection] = useState(""); const [message, setMessage] = useState(""); const [memories, setMemories] = useState<MemoryItem[]>([]);
  const refreshMemories = useCallback(async () => { try { const r = await fetch(`/api/training/memories?user_id=${encodeURIComponent(trainer)}`); const d = await r.json(); setMemories(Array.isArray(d.memories) ? d.memories : []); } catch {} }, [trainer]);
  useEffect(() => { refreshMemories(); }, [refreshMemories]);
  const analyze = async () => {
    if (!caseText.trim() || busy) return; setBusy(true); setResult(null); setMessage(""); setProgress(4); setStage("Reading training case…");
    const stages = [[18,"Identifying the concern…"],[36,"Searching Ticket Matrix…"],[58,"Nexus is reasoning…"],[78,"Checking learned context…"],[91,"Preparing trainer review…"]] as const; let idx = 0;
    const timer = setInterval(() => { if (idx < stages.length) { setProgress(stages[idx][0]); setStage(stages[idx][1]); idx++; } }, 900);
    try { const r = await fetch("/api/training/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseText, trainer, sessionId: `training-${Date.now()}` }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Training analysis failed"); setResult(d); setProgress(100); setStage("Ready for trainer review"); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Training analysis failed"); setProgress(0); setStage(""); }
    finally { clearInterval(timer); setBusy(false); }
  };
  const feedback = async (rating: number, teach = false) => {
    const correctionText = correction.trim(); if (teach && !correctionText) { setMessage("Write the correction first."); return; }
    const r = await fetch("/api/training/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: trainer, session_id: "browser-training", rating, correction: correctionText || null, teach_correction: teach }) }); const d = await r.json(); if (!r.ok) { setMessage(d.error || "Could not save feedback"); return; } setMessage(teach ? "Correction saved as learned memory. Official Ticket Matrix still has higher authority." : rating > 0 ? "Answer approved and feedback saved." : "Feedback saved. Add a correction if Nexus needs to learn a better response."); if (teach) { setCorrection(""); await refreshMemories(); }
  };
  return <div className="scrollbar flex-1 overflow-y-auto p-4 md:p-7"><div className="mx-auto max-w-6xl"><div className="mb-6"><h1 className="text-2xl font-semibold">Train Nexus</h1><p className="mt-1 text-sm text-[var(--muted)]">Paste real support cases, review Nexus, approve good answers, and save corrections. The Ticket Matrix remains authoritative.</p></div><div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 font-semibold"><GraduationCap size={18}/> Training case</div><input value={trainer} onChange={(e) => setTrainer(e.target.value)} className="ml-auto rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-xs outline-none" placeholder="Trainer name"/></div><textarea value={caseText} onChange={(e) => setCaseText(e.target.value)} rows={13} placeholder="Paste a Zendesk ticket, platform notes, agent action, or training scenario here…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm leading-6 outline-none"/><button onClick={analyze} disabled={busy || !caseText.trim()} className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--text)] px-4 py-2.5 text-sm font-medium text-[var(--bg)] disabled:opacity-40"><Brain size={16}/>{busy ? "Analyzing…" : "Analyze with Nexus"}</button>{(busy || progress > 0) && <div className="mt-4"><ProgressStatus text={stage || "Working…"} progress={progress}/></div>}{message && <div className="mt-3 rounded-xl bg-[var(--chip)] p-3 text-xs">{message}</div>}</section>
    <section className="rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="flex items-center gap-2 font-semibold"><ShieldCheck size={18}/> Trainer review</div>{result?.answer ? <><div className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4"><MarkdownMessage content={result.answer}/><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]"><span className="rounded-full bg-[var(--chip)] px-2 py-1">{result.metadata?.provider || "llama_cpp"}</span><span className="rounded-full bg-[var(--chip)] px-2 py-1">{result.metadata?.engine || "nexus"}</span><span className="rounded-full bg-[var(--chip)] px-2 py-1">{result.verified ? "verified" : "needs trainer review"}</span></div></div><div className="mt-3 flex gap-2"><button onClick={() => feedback(1, false)} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--chip)]"><ThumbsUp size={15}/> Approve</button><button onClick={() => feedback(-1, false)} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm hover:bg-[var(--chip)]"><ThumbsDown size={15}/> Incorrect</button></div><textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={5} placeholder="What should Nexus have done instead? Write the correction here…" className="mt-4 w-full resize-y rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-3 text-sm outline-none"/><button onClick={() => feedback(-1, true)} className="mt-2 flex items-center gap-2 rounded-xl bg-[var(--text)] px-4 py-2.5 text-sm text-[var(--bg)]"><Save size={15}/> Teach this correction</button></> : <div className="mt-10 text-center text-sm text-[var(--muted)]"><Brain size={34} className="mx-auto mb-3 opacity-60"/>Nexus&apos;s answer will appear here for approval or correction.</div>}</section>
  </div><section className="mt-5 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="flex items-center"><div className="flex items-center gap-2 font-semibold"><BookOpen size={18}/> Learned memories</div><button onClick={refreshMemories} className="ml-auto rounded-full p-2 hover:bg-[var(--chip)]"><RefreshCw size={15}/></button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{memories.length ? memories.slice(0, 12).map((m) => <div key={m.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-3"><div className="flex gap-2 text-[10px] uppercase text-[var(--muted)]"><span>{m.kind}</span><span>•</span><span>{m.scope}</span></div><div className="mt-2 text-sm leading-5">{m.content}</div><div className="mt-2 text-[10px] text-[var(--muted)]">Source: {m.source}</div></div>) : <div className="text-sm text-[var(--muted)]">No learned memories for this trainer yet.</div>}</div></section></div></div>;
}

function KnowledgePortal() {
  const [status, setStatus] = useState<{ source?: string; sheet?: string; sections?: number; rules?: number } | null>(null); const [q, setQ] = useState(""); const [matches, setMatches] = useState<MatrixMatch[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/knowledge/status").then(r => r.json()).then(setStatus).catch(() => {}); }, []);
  const search = async () => { setBusy(true); try { const r = await fetch(`/api/knowledge/search?q=${encodeURIComponent(q)}`); const d = await r.json(); setMatches(Array.isArray(d.matches) ? d.matches : []); } finally { setBusy(false); } };
  return <div className="scrollbar flex-1 overflow-y-auto p-4 md:p-7"><div className="mx-auto max-w-5xl"><h1 className="text-2xl font-semibold">Knowledge</h1><p className="mt-1 text-sm text-[var(--muted)]">Official company knowledge is kept separate from learned corrections.</p><div className="mt-5 grid gap-3 sm:grid-cols-3"><InfoCard label="Sheet" value={status?.sheet || "Ticket Matrix"}/><InfoCard label="Sections" value={String(status?.sections ?? "—")}/><InfoCard label="Rules" value={String(status?.rules ?? "—")}/></div><div className="mt-5 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-5"><div className="flex gap-2"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") search(); }} placeholder="Search Ticket Matrix: refund, property mismatch, occupancy…" className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] px-4 py-3 text-sm outline-none"/><button onClick={search} disabled={!q.trim() || busy} className="rounded-xl bg-[var(--text)] px-4 text-[var(--bg)] disabled:opacity-40"><Search size={17}/></button></div><div className="mt-4 space-y-3">{matches.map((m, i) => <div key={`${m.issue}-${i}`} className="rounded-2xl border border-[var(--line)] bg-[var(--panel-2)] p-4"><div className="text-xs text-[var(--muted)]">{m.section} · match {m.match_score}</div><div className="mt-1 font-semibold">{m.issue}</div><div className="mt-2 whitespace-pre-wrap text-sm leading-6">{m.instructions || "No instruction text"}</div><div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[var(--muted)]"><span>Slack: {m.slack || "—"}</span><span>Refund Queue: {m.refund_queue || "—"}</span><span>Ticket: {m.create_ticket || "—"}</span><span>Supervisor: {m.supervisor || "—"}</span><span>VIPRES: {m.vipres || "—"}</span></div></div>)}{q && !busy && !matches.length && <div className="text-sm text-[var(--muted)]">No matching Matrix rules.</div>}</div></div></div></div>;
}

function LogsPortal() {
  const [data, setData] = useState<{ enabled?: boolean; issue_count?: number; message?: string; export?: string; error?: string } | null>(null);
  const refresh = useCallback(() => { fetch("/api/logs/status").then(r => r.json()).then(setData).catch((e) => setData({ enabled: false, error: String(e) })); }, []);
  useEffect(refresh, [refresh]);
  return <div className="scrollbar flex-1 overflow-y-auto p-4 md:p-7"><div className="mx-auto max-w-4xl"><div className="flex items-center"><div><h1 className="text-2xl font-semibold">Issue Logs</h1><p className="mt-1 text-sm text-[var(--muted)]">Nexus records technical failures so Junior can fix them later.</p></div><button onClick={refresh} className="ml-auto rounded-full p-2 hover:bg-[var(--chip)]"><RefreshCw size={17}/></button></div><div className="mt-6 rounded-3xl border border-[var(--line)] bg-[var(--panel)] p-6"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--chip)]"><AlertTriangle size={20}/></div><div><div className="text-sm font-medium">Logging {data?.enabled ? "enabled" : "unavailable"}</div><div className="text-xs text-[var(--muted)]">Saved issues: {data?.issue_count ?? "—"}</div></div></div><div className="mt-5 rounded-2xl bg-[var(--panel-2)] p-4 text-sm leading-6">{data?.message || data?.error || "Loading log status…"}</div><div className="mt-3 text-xs text-[var(--muted)]">{data?.export || "Use EXPORT_NEXUS_LOGS.bat on the Nexus server to package the logs."}</div></div></div></div>;
}

function InfoCard({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4"><div className="text-xs text-[var(--muted)]">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>; }

function SettingsPanel({ models, refresh }: { models: string[]; refresh: () => void }) {
  const { settingsOpen, setSettingsOpen, systemPrompt, setSystemPrompt, engine, setEngine, model, setModel, clearActive } = useChatStore(); if (!settingsOpen) return null;
  return <div className="fixed inset-0 z-50 flex justify-end"><button className="absolute inset-0 bg-black/55" onClick={() => setSettingsOpen(false)}/><div className="relative h-full w-full max-w-md overflow-y-auto border-l border-[var(--line)] bg-[var(--panel-2)] p-5 shadow-2xl"><div className="flex items-center"><div><div className="text-lg font-semibold">Settings</div><div className="text-xs text-[var(--muted)]">Nexus + llama.cpp controls</div></div><button onClick={() => setSettingsOpen(false)} className="ml-auto rounded-full p-2 hover:bg-[var(--chip)]"><X size={19}/></button></div><label className="mt-7 block text-xs font-semibold text-[var(--muted)]">MODEL</label><select value={model} onChange={(e) => setModel(e.target.value)} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 outline-none"><option value="">Default llama.cpp model</option>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select><button onClick={refresh} className="mt-2 flex items-center gap-2 text-xs text-[var(--accent)]"><RefreshCw size={13}/> Refresh model/status</button><label className="mt-7 block text-xs font-semibold text-[var(--muted)]">ENGINE</label><select value={engine === "ollama" ? "auto" : engine} onChange={(e) => setEngine(e.target.value as typeof engine)} className="mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 outline-none"><option value="auto">Nexus Auto</option><option value="nexus">Nexus Agent</option><option value="deerflow">DeerFlow</option></select><p className="mt-2 text-xs leading-5 text-[var(--muted)]">llama.cpp is the local model provider. DeerFlow remains optional for heavier workflows.</p><label className="mt-7 block text-xs font-semibold text-[var(--muted)]">SYSTEM PROMPT</label><textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={8} className="mt-2 w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-sm leading-6 outline-none"/><button onClick={() => { clearActive(); setSettingsOpen(false); }} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10"><Trash2 size={16}/> Clear current conversation</button></div></div>;
}
