"use client";

import { useRef, useState } from "react";

import type { ContextPageAudio } from "../content/contextPages";
import styles from "./PageAudio.module.css";

export interface PageAudioPlayerProps {
  readonly audio: ContextPageAudio;
}

/**
 * The looping clip that accompanies a context page.
 *
 * Playback and muting are separate controls because they are separate things,
 * and one button cannot honestly be both: pausing is not muting, and a control
 * labelled "Mute" that stops playback lies about what it did.
 *
 * Nothing starts on its own. Browsers block autoplay with sound, so an unmuted
 * autoplay would fail on most of them and behave inconsistently on the rest —
 * and a page that begins making noise unprompted is hostile to anyone reading
 * with others nearby. `loop` is on because the clip is short and is meant to
 * sit under the reading.
 */
export function PageAudioPlayer({ audio }: PageAudioPlayerProps) {
  const elementRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  function togglePlayback() {
    const element = elementRef.current;
    if (element === null) return;

    if (playing) {
      element.pause();
      setPlaying(false);
      return;
    }

    /**
     * Applied imperatively rather than as a JSX prop: React does not reliably
     * reflect `muted` onto the element, so the attribute and the property can
     * disagree.
     */
    element.muted = muted;
    void element
      .play()
      .then(() => {
        setPlaying(true);
        setFailed(false);
      })
      .catch(() => {
        // Autoplay policy, a missing file or an unsupported codec all land
        // here. None of them should break the page the clip decorates.
        setFailed(true);
        setPlaying(false);
      });
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    const element = elementRef.current;
    if (element !== null) element.muted = next;
  }

  return (
    <div className={styles.player}>
      <button
        aria-pressed={playing}
        className={styles.button}
        onClick={togglePlayback}
        type="button"
      >
        {playing ? "Pause" : "Play"}
        <span className={styles.visuallyHidden}> {audio.title}</span>
      </button>

      <button
        aria-pressed={muted}
        className={styles.secondaryButton}
        onClick={toggleMuted}
        type="button"
      >
        {muted ? "Unmute" : "Mute"}
        <span className={styles.visuallyHidden}> {audio.title}</span>
      </button>

      <p className={styles.credit}>
        <span className={styles.title}>{audio.title}</span>
        <span className={styles.attribution}>{audio.credit}</span>
      </p>

      {failed ? (
        <p className={styles.error} role="alert">
          This clip could not be played.
        </p>
      ) : null}

      {/*
        No caption track: the clip is instrumental music used as decoration and
        the page's prose is the content, so there is nothing to transcribe.
      */}
      <audio
        loop
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        preload="none"
        ref={elementRef}
        src={audio.src}
      />
    </div>
  );
}
