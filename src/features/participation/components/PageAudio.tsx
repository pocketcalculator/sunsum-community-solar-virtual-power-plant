"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { PageAudioConfiguration } from "../content/pageAudio";
import styles from "./PageAudio.module.css";

export interface PageAudioPlayerProps { readonly audio: PageAudioConfiguration }

function createPlaybackCoordinator() {
  let current: { id: string; stop: () => void } | null = null;
  return {
    claim(id: string, stop: () => void) {
      const previous = current;
      current = { id, stop };
      if (previous && previous.id !== id) previous.stop();
    },
    owns(id: string) { return current?.id === id; },
    release(id: string) { if (current?.id === id) current = null; },
    stop() {
      const previous = current;
      current = null;
      previous?.stop();
    },
  };
}

const PlaybackContext = createContext<ReturnType<typeof createPlaybackCoordinator> | null>(null);

function usePlaybackCoordinator() {
  const coordinator = useContext(PlaybackContext);
  if (!coordinator) throw new Error("PageAudioPlayer requires PageAudioProvider.");
  return coordinator;
}

export function PageAudioProvider({ children }: { children: ReactNode }) {
  const [coordinator] = useState(createPlaybackCoordinator);
  useEffect(() => () => coordinator.stop(), [coordinator]);
  return <PlaybackContext.Provider value={coordinator}>{children}</PlaybackContext.Provider>;
}

type Phase = "ready" | "loading" | "playing" | "paused" | "ended" | "error";
const STATUS: Record<Phase, string> = {
  ready: "Optional music. Choose Play to listen; the page text contains the story.",
  loading: "Loading the clip. Choose Pause to cancel.",
  playing: "Playing.",
  paused: "Paused.",
  ended: "Finished. Choose Play to listen again.",
  error: "This clip could not be played. Check your connection and try Play again.",
};

export function PageAudioPlayer({ audio }: PageAudioPlayerProps) {
  return <ClipPlayer key={audio.src} audio={audio} />;
}

function ClipPlayer({ audio }: PageAudioPlayerProps) {
  const coordinator = usePlaybackCoordinator();
  const id = useId();
  const elementRef = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const requested = useRef(false);
  const mutedValue = useRef(false);
  const [phase, setPhase] = useState<Phase>("ready");
  const [muted, setMuted] = useState(false);

  const finish = useCallback((next: Phase) => {
    generation.current++;
    requested.current = false;
    coordinator.release(id);
    elementRef.current?.pause();
    if (mounted.current) setPhase(next);
  }, [coordinator, id]);
  const stop = useCallback(() => finish("paused"), [finish]);

  useEffect(() => {
    mounted.current = true;
    const element = elementRef.current;
    return () => {
      mounted.current = false;
      generation.current += 1;
      requested.current = false;
      coordinator.release(id);
      element?.pause();
    };
  }, [coordinator, id]);

  function togglePlayback() {
    const element = elementRef.current;
    if (!element) return;
    if (requested.current) { stop(); return; }
    coordinator.claim(id, stop);
    const attempt = ++generation.current;
    requested.current = true;
    setPhase("loading");
    element.muted = mutedValue.current;
    const current = () => mounted.current && requested.current &&
      generation.current === attempt && coordinator.owns(id);
    let playing: Promise<void>;
    try {
      if (element.error) element.load();
      playing = element.play();
    } catch {
      finish("error");
      return;
    }
    void playing.then(() => {
      if (!current()) {
        // A stale promise may settle after cancellation, but cannot pause a newer attempt on this element.
        if (!requested.current || !coordinator.owns(id)) element.pause();
        return;
      }
      if (element.paused) finish(element.ended ? "ended" : "paused");
      else setPhase("playing");
    }, () => {
      if (current()) finish("error");
    });
  }

  function toggleMuted() {
    const next = !mutedValue.current;
    mutedValue.current = next;
    setMuted(next);
    if (elementRef.current) elementRef.current.muted = next;
  }

  const active = phase === "playing" || phase === "loading";
  return <section className={styles.player} aria-label={`Music: ${audio.title}`}>
    <button type="button" className={styles.button} aria-pressed={phase === "playing"}
      aria-label={`${active ? "Pause" : "Play"} ${audio.title}`}
      aria-describedby={`${id}-status`} onClick={togglePlayback}>
      {active ? "Pause" : "Play"}
    </button>
    <button type="button" className={styles.secondaryButton} aria-pressed={muted}
      aria-label={`${muted ? "Unmute" : "Mute"} ${audio.title}`} onClick={toggleMuted}>
      {muted ? "Unmute" : "Mute"}
    </button>
    <p className={styles.credit}>
      <span className={styles.title}>{audio.title}</span>
      <span className={styles.attribution}>{audio.credit}</span>
    </p>
    <p id={`${id}-status`} className={phase === "error" ? styles.error : styles.status}
      role={phase === "error" ? "alert" : "status"}>{STATUS[phase]}</p>
    <p className={styles.license}>Third-party music, separate from the software&apos;s MIT license.</p>
    <audio ref={elementRef} src={audio.src} preload="none"
      onPlaying={() => {
        if (requested.current && coordinator.owns(id)) setPhase("playing");
        else elementRef.current?.pause();
      }}
      onWaiting={() => { if (requested.current && coordinator.owns(id)) setPhase("loading"); }}
      onPause={() => { if (requested.current && elementRef.current?.paused) stop(); }}
      onEnded={() => finish("ended")}
      onError={(event) => {
        if (event.currentTarget.error?.code === 1 && !requested.current) return;
        finish("error");
      }} />
  </section>;
}
