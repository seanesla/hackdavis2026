"use client";
// Web Speech API wrapper. Chrome/Edge only. SSR-safe.
import { useCallback, useEffect, useRef, useState } from "react";

// SpeechRecognition isn't in the standard DOM lib types — minimal shim.
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!getRecognitionCtor() && "speechSynthesis" in window;
}

let cachedVoices: SpeechSynthesisVoice[] | null = null;

export function preloadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  if (cachedVoices) return Promise.resolve(cachedVoices);
  return new Promise((resolve) => {
    const initial = window.speechSynthesis.getVoices();
    if (initial.length > 0) {
      cachedVoices = initial;
      resolve(initial);
      return;
    }
    const handler = () => {
      const v = window.speechSynthesis.getVoices();
      cachedVoices = v;
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      resolve(v);
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    // Safety timeout in case voiceschanged never fires.
    setTimeout(() => {
      if (!cachedVoices) {
        cachedVoices = window.speechSynthesis.getVoices();
        resolve(cachedVoices);
      }
    }, 1500);
  });
}

// Track the active Audio element so stopSpeaking() can interrupt mid-sentence.
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;

function clearCurrentAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.src = "";
    } catch {
      /* noop */
    }
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try {
      URL.revokeObjectURL(currentAudioUrl);
    } catch {
      /* noop */
    }
    currentAudioUrl = null;
  }
}

function speakWithBrowser(
  text: string,
  opts?: { onEnd?: () => void; rate?: number; pitch?: number }
) {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = opts?.rate ?? 1.0;
  u.pitch = opts?.pitch ?? 1.0;
  if (cachedVoices && cachedVoices.length > 0) {
    const preferred =
      cachedVoices.find((v) => /en-US/i.test(v.lang) && /female|samantha/i.test(v.name)) ||
      cachedVoices.find((v) => /en/i.test(v.lang)) ||
      cachedVoices[0];
    u.voice = preferred;
  }
  if (opts?.onEnd) {
    u.onend = () => opts.onEnd!();
    u.onerror = () => opts.onEnd!();
  }
  window.speechSynthesis.speak(u);
}

export function speak(
  text: string,
  opts?: { onEnd?: () => void; rate?: number; pitch?: number }
): void {
  if (typeof window === "undefined") return;
  // Cancel any in-flight speech (browser queue + ElevenLabs audio).
  window.speechSynthesis.cancel();
  clearCurrentAudio();

  // Try ElevenLabs first; on any failure, fall back to browser voice.
  // The /api/tts route returns 503 when no key is configured, which also
  // routes through the fallback — so an unconfigured app just sounds robotic.
  fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      if (!blob || blob.size === 0) throw new Error("empty audio");
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      // If a newer speak() already replaced us, abandon this one.
      if (currentAudio !== null || currentAudioUrl !== null) {
        URL.revokeObjectURL(url);
        return;
      }
      currentAudio = audio;
      currentAudioUrl = url;
      const onDone = () => {
        if (currentAudio === audio) clearCurrentAudio();
        opts?.onEnd?.();
      };
      audio.onended = onDone;
      audio.onerror = onDone;
      try {
        await audio.play();
      } catch {
        // Autoplay blocked or other playback error — fall back.
        clearCurrentAudio();
        speakWithBrowser(text, opts);
      }
    })
    .catch(() => {
      // Network error or non-OK status — fall back to browser voice.
      speakWithBrowser(text, opts);
    });
}

export function stopSpeaking(): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
  clearCurrentAudio();
}

export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  if (window.speechSynthesis.speaking) return true;
  if (currentAudio && !currentAudio.paused && !currentAudio.ended) return true;
  return false;
}

export type RecognizerHandle = {
  listening: boolean;
  finalTranscript: string;
  interim: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
  // Synchronous refs for code that runs outside React's render cycle
  // (setInterval polling, etc. — state values would be stale in closures).
  listeningRef: React.MutableRefObject<boolean>;
  finalRef: React.MutableRefObject<string>;
};

export function useRecognizer(): RecognizerHandle {
  const [listening, setListening] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const finalRef = useRef("");

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) {
        finalRef.current = (finalRef.current + " " + finalText).trim();
        setFinalTranscript(finalRef.current);
      }
      setInterim(interimText);
    };
    rec.onerror = (event: { error?: string }) => {
      setError(event?.error ?? "speech error");
      listeningRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      listeningRef.current = false;
      setListening(false);
      setInterim("");
    };
    rec.onstart = () => {
      listeningRef.current = true;
      setListening(true);
      setError(null);
    };

    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* noop */
      }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    finalRef.current = "";
    setFinalTranscript("");
    setInterim("");
    setError(null);
    try {
      rec.start();
    } catch {
      // start() throws if already started; ignore.
    }
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* noop */
    }
  }, []);

  const reset = useCallback(() => {
    finalRef.current = "";
    setFinalTranscript("");
    setInterim("");
    setError(null);
  }, []);

  return {
    listening,
    finalTranscript,
    interim,
    start,
    stop,
    reset,
    error,
    listeningRef,
    finalRef,
  };
}

// One-shot trick to surface the mic permission prompt early, before the
// real demo flow starts. After first grant, Chrome remembers it.
export function primeMicPermission(): void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return;
  try {
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.onstart = () => {
      try {
        rec.stop();
      } catch {
        /* noop */
      }
    };
    rec.start();
  } catch {
    /* noop */
  }
}
