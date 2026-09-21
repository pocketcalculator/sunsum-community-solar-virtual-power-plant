"use client";

import { useId, type ReactNode } from "react";
import { DisplayIcon, MoonIcon, SunIcon } from "../icons";
import { cx } from "../cx";
import {
  DARK_THEME,
  LIGHT_THEME,
  SYSTEM_PREFERENCE,
  THEME_PREFERENCES,
  type ThemePreference,
} from "./theme";
import { useTheme } from "./useTheme";
import styles from "./ThemeToggle.module.css";

interface ThemeOption {
  readonly label: string;
  /** Hover text. A supplement to the name, never the only source of it. */
  readonly title: string;
  readonly icon: ReactNode;
}

const OPTIONS = {
  [LIGHT_THEME]: {
    label: "Light",
    title: "Always use the light theme",
    icon: <SunIcon />,
  },
  [DARK_THEME]: {
    label: "Dark",
    title: "Always use the dark theme",
    icon: <MoonIcon />,
  },
  [SYSTEM_PREFERENCE]: {
    label: "System",
    title: "Follow the theme this device is set to",
    icon: <DisplayIcon />,
  },
} satisfies Record<ThemePreference, ThemeOption>;

interface ThemeToggleProps {
  className?: string | undefined;
  compact?: boolean;
}

/**
 * Chooses the colour theme.
 *
 * Three native radios rather than a button that cycles: every state is one
 * action away and visibly either on or off, where cycling asks the person to
 * remember the order and press twice to undo a mistake. Keeping them native
 * also keeps arrow-key movement, the checked state and forced-colours
 * behaviour with the browser instead of re-implementing them here.
 *
 * "System" stays on the list as a first-class choice. Once someone has picked
 * light or dark, returning to the device setting has to be possible, and a
 * two-state control cannot offer it.
 *
 * The labels are hidden rather than dropped: the icons carry the meaning on
 * screen, the text carries it to a screen reader, and the group's legend says
 * what all three are for.
 *
 * It stays disabled until the store is live. A native radio changes its own
 * checked state with no script running at all, so an enabled control would
 * report a theme the document never adopted — permanently for someone browsing
 * without JavaScript, and briefly for everyone else before hydration.
 */
export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { preference, ready, resolvedTheme, setPreference } = useTheme();
  const groupId = useId();

  if (compact) {
    const dark = resolvedTheme === DARK_THEME;
    return (
      <button
        type="button"
        role="switch"
        aria-label="Dark appearance"
        aria-checked={dark}
        disabled={!ready}
        title={dark ? "Switch to light appearance" : "Switch to dark appearance"}
        className={cx(styles.compact, className)}
        onClick={() => setPreference(dark ? LIGHT_THEME : DARK_THEME)}
      >
        <span aria-hidden="true" className={styles.icon}>
          {dark ? <MoonIcon /> : <SunIcon />}
        </span>
      </button>
    );
  }

  return (
    <fieldset className={cx(styles.group, className)} disabled={!ready}>
      <legend className={styles.legend}>Colour theme</legend>
      <div className={styles.options}>
        {THEME_PREFERENCES.map((value) => {
          const option = OPTIONS[value];
          const optionId = `${groupId}-${value}`;

          return (
            <div className={styles.option} key={value}>
              <input
                checked={preference === value}
                className={styles.input}
                id={optionId}
                name={groupId}
                onChange={() => setPreference(value)}
                type="radio"
                value={value}
              />
              <label
                className={styles.label}
                htmlFor={optionId}
                title={option.title}
              >
                <span aria-hidden="true" className={styles.icon}>
                  {option.icon}
                </span>
                <span className={styles.name}>{option.label}</span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
