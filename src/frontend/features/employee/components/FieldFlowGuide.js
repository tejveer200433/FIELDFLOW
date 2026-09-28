"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, RotateCcw, Send, ShieldCheck, Sparkles, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiJson } from "@/frontend/lib/apiClient";

const starters = [
  "What should I work on next?",
  "What evidence is still needed?",
  "Review today's time"
];

const stateCopy = {
  idle: "Ready when you are",
  listening: "Listening to your question",
  thinking: "Reviewing your workday",
  speaking: "Sharing your next step",
  error: "Needs another try"
};

function initialMessage(firstName) {
  return {
    id: "welcome",
    role: "assistant",
    content: `Hi ${firstName}. I can help you plan today's work, explain attendance, and check what a task still needs. I only use your permitted FieldFlow information.`,
    actions: []
  };
}

export default function FieldFlowGuide({ employeeName }) {
  const router = useRouter();
  const firstName = String(employeeName || "there").split(" ")[0];
  const [messages, setMessages] = useState(() => [initialMessage(firstName)]);
  const [suggestions, setSuggestions] = useState(starters);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [revealingMessageId, setRevealingMessageId] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("ready");
  const requestId = useRef(0);
  const revealTimer = useRef(null);
  const voiceEnabledRef = useRef(false);

  useEffect(() => () => {
    if (revealTimer.current) window.clearInterval(revealTimer.current);
    window.speechSynthesis?.cancel();
  }, []);

  const history = useMemo(() => messages.filter(item => item.id !== "welcome").slice(-8).map(item => ({
    role: item.role,
    content: item.content
  })), [messages]);

  const companionState = error
    ? "error"
    : revealing || voiceActive
      ? "speaking"
      : busy
        ? "thinking"
        : inputFocused || input.trim()
          ? "listening"
          : "idle";

  function speak(text) {
    if (!voiceEnabledRef.current || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 1.02;
    utterance.onstart = () => setVoiceActive(true);
    utterance.onend = () => setVoiceActive(false);
    utterance.onerror = () => setVoiceActive(false);
    window.speechSynthesis.speak(utterance);
  }

  function toggleVoice() {
    const next = !voiceEnabled;
    voiceEnabledRef.current = next;
    setVoiceEnabled(next);
    if (!next) {
      window.speechSynthesis?.cancel();
      setVoiceActive(false);
    }
  }

  function revealAnswer(id, answer) {
    const fullMessage = String(answer.message || "");
    const assistantMessage = {
      id: `assistant-${id}`,
      role: "assistant",
      content: "",
      actions: answer.actions || []
    };
    setMessages(current => [...current, assistantMessage]);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMessages(current => current.map(item => item.id === assistantMessage.id ? { ...item, content: fullMessage } : item));
      return Promise.resolve();
    }
    setRevealing(true);
    setRevealingMessageId(assistantMessage.id);
    return new Promise(resolve => {
      let visibleCharacters = 0;
      revealTimer.current = window.setInterval(() => {
        if (requestId.current !== id) {
          window.clearInterval(revealTimer.current);
          revealTimer.current = null;
          setRevealing(false);
          setRevealingMessageId(null);
          resolve();
          return;
        }
        visibleCharacters = Math.min(fullMessage.length, visibleCharacters + 5);
        setMessages(current => current.map(item => item.id === assistantMessage.id
          ? { ...item, content: fullMessage.slice(0, visibleCharacters) }
          : item));
        if (visibleCharacters >= fullMessage.length) {
          window.clearInterval(revealTimer.current);
          revealTimer.current = null;
          setRevealing(false);
          setRevealingMessageId(null);
          resolve();
        }
      }, 22);
    });
  }

  async function askGuide(value) {
    const question = String(value || input).trim();
    if (!question || busy) return;
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setInput("");
    setMessages(current => [...current, { id: `user-${id}`, role: "user", content: question, actions: [] }]);
    try {
      const payload = await apiJson("/api/ai/employee-guide", {
        method: "POST",
        body: JSON.stringify({ message: question, history })
      });
      setMode(payload.data.mode);
      setSuggestions(payload.data.suggestions || []);
      await revealAnswer(id, payload.data);
      speak(payload.data.message);
    } catch (requestError) {
      setError(requestError.message || "The Guide could not answer right now.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    requestId.current += 1;
    if (revealTimer.current) window.clearInterval(revealTimer.current);
    revealTimer.current = null;
    window.speechSynthesis?.cancel();
    setMessages([initialMessage(firstName)]);
    setSuggestions(starters);
    setInput("");
    setError("");
    setMode("ready");
    setBusy(false);
    setRevealing(false);
    setRevealingMessageId(null);
    setVoiceActive(false);
  }

  return <section id="fieldflow-ai" aria-labelledby="fieldflow-guide-title" className="relative overflow-hidden rounded-lg border border-violet-200 bg-white shadow-[0_14px_34px_rgba(76,81,191,0.08)]">
    <div className="grid min-h-[500px] lg:grid-cols-[minmax(290px,.82fr)_minmax(0,1.45fr)]">
      <div className="flex min-w-0 flex-col border-b border-violet-100 bg-[#f7f6ff] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-violet-600">Your AI work companion</p>
            <h2 id="fieldflow-guide-title" className="mt-1 text-xl font-extrabold text-slate-950">FieldFlow Guide</h2>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wide ${mode === "ai" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{mode === "ai" ? "AI connected" : mode === "guided" ? "Guided mode" : "Ready"}</span>
        </div>

        <div className="fieldflow-companion" data-state={companionState}>
          <Image src="/images/fieldflow-guide-companion.png" alt="FieldFlow Guide, an AI work companion" width={1024} height={1366} className="fieldflow-companion__image" sizes="(max-width: 1024px) 260px, 310px" />
          <div className="fieldflow-companion__status" role="status">
            <span aria-hidden="true" />
            {stateCopy[companionState]}
          </div>
        </div>

        <div className="mt-auto px-5 pb-5">
          <p className="text-xs leading-5 text-slate-600">Grounded in your assignments, attendance, work-session status, and task checklists.</p>
          <button type="button" onClick={() => askGuide("Plan my workday and tell me the single best next step.")} disabled={busy} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-3 text-xs font-bold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"><Sparkles className="h-4 w-4" />Plan my day</button>
          <div className="mt-4 flex items-start gap-2 text-[10px] leading-4 text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>The Guide cannot change attendance, tasks, evidence, or tracking. You confirm actions in FieldFlow.</span></div>
        </div>
      </div>

      <div className="flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div><p className="text-sm font-extrabold text-slate-950">Ask about your workday</p><p className="mt-0.5 text-[10px] text-slate-500">Only your permitted FieldFlow context is used</p></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleVoice} aria-pressed={voiceEnabled} aria-label={voiceEnabled ? "Turn off spoken replies" : "Turn on spoken replies"} title={voiceEnabled ? "Spoken replies on" : "Read replies aloud"} className={`icon-button h-9 w-9 ${voiceEnabled ? "border-violet-300 bg-violet-50 text-violet-700" : ""}`}>{voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}</button>
            <button type="button" onClick={reset} disabled={busy} aria-label="Clear Guide conversation" title="Clear conversation" className="icon-button h-9 w-9"><RotateCcw className="h-4 w-4" /></button>
          </div>
        </div>
        <div aria-live="polite" className="min-h-52 flex-1 space-y-3 overflow-y-auto py-4 lg:max-h-[310px]">
          {messages.map(message => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] ${message.role === "user" ? "rounded-lg bg-violet-600 px-3.5 py-2.5 text-white" : "border-l-2 border-violet-300 pl-3.5 text-slate-700"}`}><p className="text-xs leading-5">{message.content}{revealing && message.id === revealingMessageId ? <span className="fieldflow-guide-caret" aria-hidden="true" /> : null}</p>{message.actions?.length > 0 && message.content && <div className="mt-2 flex flex-wrap gap-2">{message.actions.map(action => <button type="button" key={`${message.id}-${action.route}`} onClick={() => router.push(action.route)} className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-violet-700 hover:bg-violet-50">{action.label}<ArrowUpRight className="h-3 w-3" /></button>)}</div>}</div></div>)}
          {busy && !revealing && <div className="flex items-center gap-2 border-l-2 border-violet-300 pl-3.5 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin text-violet-600" />Checking your FieldFlow workday...</div>}
        </div>
        {error && <div role="alert" className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">{suggestions.map(suggestion => <button type="button" key={suggestion} disabled={busy} onClick={() => askGuide(suggestion)} className="shrink-0 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[10px] font-semibold text-violet-700 hover:border-violet-400 disabled:opacity-50">{suggestion}</button>)}</div>
        <form onSubmit={event => { event.preventDefault(); askGuide(); }} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100"><label htmlFor="fieldflow-guide-input" className="sr-only">Ask FieldFlow Guide</label><input id="fieldflow-guide-input" value={input} onFocus={() => setInputFocused(true)} onBlur={() => setInputFocused(false)} onChange={event => setInput(event.target.value)} maxLength={800} disabled={busy} placeholder="Ask what to do next..." className="min-w-0 flex-1 bg-transparent px-2 text-xs text-slate-900 outline-none placeholder:text-slate-400" /><button type="submit" disabled={busy || !input.trim()} aria-label="Send question" title="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-violet-600 text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Send className="h-4 w-4" /></button></form>
        <p className="mt-2 text-center text-[9px] text-slate-400">AI guidance can be incomplete. Verify important details in the linked FieldFlow record.</p>
      </div>
    </div>
  </section>;
}
