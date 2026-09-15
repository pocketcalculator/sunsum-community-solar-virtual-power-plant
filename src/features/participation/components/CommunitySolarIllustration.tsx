import styles from "./CommunitySolarIllustration.module.css";

/**
 * Original stylised diagram: sunlight over three neighbourhood buildings whose
 * panels feed one shared project record. Geometry is hand-placed so the roof
 * planes and the panel rows stay aligned at any width.
 */
export function CommunitySolarIllustration() {
  return (
    <figure className={styles.figure}>
      <svg
        className={styles.canvas}
        viewBox="0 0 480 340"
        role="img"
        aria-label="Diagram: sunlight over three neighbourhood buildings with rooftop solar panels, each connected to one shared project record."
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="sunsum-sun-glow" cx="50%" cy="50%" r="50%">
            <stop
              offset="0%"
              stopColor="var(--accent-solar)"
              stopOpacity="0.45"
            />
            <stop
              offset="100%"
              stopColor="var(--accent-solar)"
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        <circle cx="404" cy="56" r="86" fill="url(#sunsum-sun-glow)" />
        <circle className={styles.sun} cx="404" cy="56" r="26" />
        <g className={styles.rays}>
          <path d="M404 12v-8" />
          <path d="M448 56h8" />
          <path d="M360 56h-8" />
          <path d="m435 25 6-6" />
          <path d="m373 25-6-6" />
          <path d="m435 87 6 6" />
        </g>

        {/* Left building */}
        <polygon
          className={styles.wall}
          points="44,176 132,152 132,250 44,250"
        />
        <polygon
          className={styles.panel}
          points="36,168 140,140 140,150 36,178"
        />
        <g className={styles.panelSeam}>
          <path d="M62 161v10" />
          <path d="M88 154v10" />
          <path d="M114 147v10" />
        </g>
        <g className={styles.window}>
          <rect x="58" y="198" width="20" height="24" rx="3" />
          <rect x="98" y="188" width="20" height="24" rx="3" />
        </g>

        {/* Centre building */}
        <polygon
          className={styles.wall}
          points="174,137 314,123 314,250 174,250"
        />
        <polygon
          className={styles.panel}
          points="166,128 322,112 322,122 166,138"
        />
        <g className={styles.panelSeam}>
          <path d="M197 125v10" />
          <path d="M228 121v10" />
          <path d="M260 118v10" />
          <path d="M291 115v10" />
        </g>
        <g className={styles.window}>
          <rect x="192" y="164" width="22" height="26" rx="3" />
          <rect x="232" y="160" width="22" height="26" rx="3" />
          <rect x="272" y="156" width="22" height="26" rx="3" />
          <rect x="228" y="210" width="30" height="40" rx="4" />
        </g>

        {/* Right building */}
        <polygon
          className={styles.wall}
          points="354,184 438,164 438,250 354,250"
        />
        <polygon
          className={styles.panel}
          points="346,176 446,152 446,162 346,186"
        />
        <g className={styles.panelSeam}>
          <path d="M379 168v10" />
          <path d="M412 160v10" />
        </g>
        <g className={styles.window}>
          <rect x="368" y="204" width="20" height="24" rx="3" />
          <rect x="404" y="196" width="20" height="24" rx="3" />
        </g>

        <path className={styles.ground} d="M18 250h444" />

        {/* Shared project record */}
        <g className={styles.feed}>
          <path d="M88 252c0 16 52 14 90 16" />
          <path d="M244 252v16" />
          <path d="M396 252c0 16-52 14-90 16" />
        </g>
        <rect
          className={styles.record}
          x="140"
          y="266"
          width="200"
          height="50"
          rx="14"
        />
        <circle className={styles.recordDot} cx="168" cy="291" r="7" />
        <g className={styles.recordLine}>
          <path d="M188 284h124" />
          <path d="M188 298h86" />
        </g>
      </svg>
      <figcaption className={styles.caption}>
        Illustrative diagram — not project data.
      </figcaption>
    </figure>
  );
}
