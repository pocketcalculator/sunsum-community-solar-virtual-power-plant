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
 * Deliberately starts muted and requires a click to play. Browsers block
 * autoplay with sound, so an unmuted autoplay would fail silently on most of
 * them and behave inconsistently on the rest — and a page that starts making
 * noise on its own is hostile to anyone reading with others nearby or using a
 * screen reader.
 *
 * `loop` is on because the clip is short and meant to sit under the reading,
 * and a mute control is always present, which is what was asked for.
 */
export function PageAudioPlayer({ audio }: PageAudioPlayerProps) {
  const elementRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  function toggle() {
    const element = elementRef.current;
    if (element === null) return;

    if (playing) {
      element.pause();
      setPlaying(false);
      return;
    }

    element.muted = false;
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

  return (
    <div className={styles.player}>
      <button
        className={styles.button}
        onClick={toggle}
        type="button"
        aria-pressed={playing}
      >
        {playing ? "Mute" : "Play"}
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
        muted
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        preload="none"
        ref={elementRef}
        src={audio.src}
      />
    </div>
  );
}
