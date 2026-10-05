export const inspectorStyles = String.raw`
  :host {
    --refer-ink: #f7f7f4;
    --refer-muted: #b6b8b0;
    --refer-faint: #85877f;
    --refer-panel: #171816;
    --refer-panel-raised: #20211f;
    --refer-line: rgba(255, 255, 255, 0.12);
    --refer-accent: #a6f4c5;
    all: initial;
    color-scheme: dark;
    contain: layout style;
    direction: ltr;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    font-synthesis: none;
    line-height: 1.35;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  .root {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    color: var(--refer-ink);
    color-scheme: dark;
    direction: ltr;
    font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
    font-synthesis: none;
    line-height: 1.35;
    pointer-events: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .highlight {
    position: fixed;
    inset: 0 auto auto 0;
    z-index: 0;
    pointer-events: none;
    transition: none;
  }

  .highlight-fill,
  .highlight-edge {
    position: absolute;
    inset: 0 auto auto 0;
    width: 1px;
    height: 1px;
    transform-origin: top left;
    transition: none;
  }

  .highlight-fill { background: rgba(166, 244, 197, 0.08); }
  .highlight-edge { background: var(--refer-accent); }

  .highlight[hidden],
  .save-feedback[hidden],
  .hud[hidden],
  .font-preview[hidden],
  .sections[hidden],
  .hint[hidden],
  .toast[hidden] {
    display: none;
  }

  .chip,
  .hud,
  .toast {
    color: var(--refer-ink);
    background: var(--refer-panel);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.32),
      0 12px 34px rgba(0, 0, 0, 0.24),
      inset 0 0 0 1px var(--refer-line);
  }

  .chip {
    position: fixed;
    z-index: 3;
    inset-block-start: max(12px, env(safe-area-inset-top));
    inset-inline-start: 50%;
    display: flex;
    min-height: 44px;
    align-items: center;
    gap: 8px;
    padding: 5px 5px 5px 14px;
    border-radius: 17px;
    transform: translateX(-50%);
    pointer-events: auto;
    white-space: nowrap;
  }

  .chip button { min-block-size: 34px; padding-inline: 12px; font-size: 13px; border-radius: 12px; }

  .status-dot {
    inline-size: 7px;
    block-size: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--refer-accent);
    box-shadow: 0 0 0 3px rgba(166, 244, 197, 0.12);
  }

  .chip-label {
    margin-inline: 2px 4px;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  button {
    appearance: none;
    min-inline-size: 32px;
    min-block-size: 28px;
    border: 0;
    border-radius: 10px;
    color: inherit;
    background: var(--refer-panel-raised);
    font: inherit;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 2px solid var(--refer-ink);
    outline-offset: 2px;
  }

  .exit,
  .library {
    padding-inline: 10px;
    color: var(--refer-muted);
    font-size: 12px;
  }

  .hud {
    position: fixed;
    inset: 0 auto auto 0;
    z-index: 1;
    inline-size: min(288px, calc(100vw - 24px));
    max-block-size: calc(100vh - 24px);
    overflow: auto;
    overscroll-behavior: contain;
    border-radius: 4px;
    pointer-events: auto;
    scrollbar-width: thin;
  }

  .sections {
    display: grid;
    gap: 1px;
    background: var(--refer-line);
  }

  .hud[data-expanded="false"] {
    inline-size: max-content;
    max-inline-size: min(288px, calc(100vw - 16px));
    pointer-events: none;
  }

  .font-preview {
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .section {
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 14px;
    background: var(--refer-panel);
  }

  .section-title {
    margin: 1px 0 0;
    color: var(--refer-faint);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.08em;
    line-height: 1.4;
    text-transform: uppercase;
  }

  .values {
    display: grid;
    min-inline-size: 0;
    gap: 5px;
    margin: 0;
  }

  .value-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 10px;
    min-inline-size: 0;
  }

  .value-row dt,
  .value-row dd {
    min-inline-size: 0;
    margin: 0;
  }

  .value-row dt {
    overflow: hidden;
    color: var(--refer-ink);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value-row dd {
    color: var(--refer-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: end;
    white-space: nowrap;
  }

  .box-section { row-gap: 8px; }
  .box-section > .section-title { grid-column: 1; grid-row: 1 / span 2; }
  .box-section > .box-diagram { grid-column: 2; grid-row: 1; }
  .box-section > .values { grid-column: 2; grid-row: 2; }
  .box-diagram { min-width: 0; font-size: 10px; font-variant-numeric: tabular-nums; }
  .box-layer {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) 18px;
    grid-template-rows: 18px minmax(0, auto) 18px;
    min-width: 0;
    border: 1px dashed #66685f;
    border-radius: 4px;
    background: #252620;
  }
  .box-border { border-style: solid; border-color: #62695c; background: #30362c; }
  .box-padding { border-color: #6c8d75; background: #354b3c; }
  .box-label { grid-area: 1 / 1 / 2 / 4; align-self: center; justify-self: start; padding: 0 6px; color: #c5cabf; font-size: 9px; }
  .box-side { min-width: 0; align-self: center; text-align: center; color: var(--refer-ink); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; overflow-wrap: anywhere; line-height: 1.2; }
  .box-top { grid-area: 1 / 2; }
  .box-right { grid-area: 2 / 3; }
  .box-bottom { grid-area: 3 / 2; }
  .box-left { grid-area: 2 / 1; }
  .box-inner { grid-area: 2 / 2; min-width: 0; }
  .box-content { display: grid; gap: 2px; min-height: 34px; padding: 3px; place-content: center; border: 1px solid #789e85; border-radius: 2px; background: #18291e; text-align: center; }
  .box-content > span:first-child { color: #b2c9b8; font-size: 9px; }
  .box-dimensions { color: var(--refer-accent); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; overflow-wrap: anywhere; }

  .swatch-line {
    display: flex;
    min-inline-size: 0;
    align-items: center;
    gap: 7px;
  }

  .swatch {
    inline-size: 10px;
    block-size: 10px;
    flex: 0 0 auto;
    border-radius: 2px;
    outline: 1px solid rgba(255, 255, 255, 0.22);
    outline-offset: 0;
  }

  .hint {
    padding: 9px 14px 11px;
    color: var(--refer-faint);
    font-size: 10px;
    line-height: 1.5;
    text-align: center;
  }

  kbd {
    color: var(--refer-muted);
    font-family: inherit;
    font-size: inherit;
  }

  .toast {
    position: fixed;
    z-index: 4;
    inset-inline-start: 50%;
    inset-block-start: max(72px, calc(env(safe-area-inset-top) + 60px));
    display: flex;
    min-block-size: 44px;
    max-inline-size: calc(100vw - 24px);
    align-items: center;
    gap: 4px;
    padding: 4px 5px 4px 14px;
    border-radius: 18px;
    transform: translateX(-50%);
    pointer-events: auto;
    white-space: nowrap;
  }

  .toast-mark {
    color: var(--refer-accent);
    font-size: 13px;
    font-weight: 700;
  }

  .toast-message {
    margin-inline: 2px 8px;
    color: var(--refer-ink);
    font-size: 12px;
    font-weight: 600;
  }

  .toast button {
    min-block-size: 34px;
    padding-inline: 10px;
    border-radius: 13px;
    color: var(--refer-muted);
    font-size: 12px;
  }

  .toast .close {
    min-inline-size: 34px;
    padding: 0;
    color: var(--refer-faint);
    font-size: 16px;
    font-weight: 400;
  }

  .toast[data-kind="error"] .toast-mark {
    color: #fda29b;
  }

  .save-feedback {
    position: fixed;
    z-index: 5;
    pointer-events: none;
    border-radius: 2px;
  }
  .save-confirmation {
    position: fixed;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    width: 76px;
    height: 28px;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 4px;
    background: #202521;
    color: #f0f5f1;
    font-size: 11px;
    font-weight: 550;
    box-shadow: 0 2px 6px #0002;
    pointer-events: none;
  }
  .save-feedback-check { width: 16px; height: 16px; color: #a6f4c5; }
  .save-feedback-check path { fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 0; }

  @media (hover: hover) {
    button:hover {
      background: #2b2c29;
    }
  }

  @media (prefers-reduced-motion: no-preference) {

    .chip {
      opacity: 1;
      transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease;
    }

    @starting-style {
      .chip {
        opacity: 0;
        transform: translate(-50%, -12px);
      }
    }

    .toast {
      opacity: 1;
      transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 240ms ease;
    }

    @starting-style {
      .toast {
        opacity: 0;
        transform: translate(-50%, -12px);
      }
    }

    /* Each edge retargets from its current position during rapid pointer changes. */
    .highlight[data-smooth="true"],
    .highlight[data-smooth="true"] > * {
      transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
    }

    /* Retarget from the current visual position as the inspected element changes. */
    .hud {
      transition: transform 160ms cubic-bezier(0.2, 0, 0, 1);
    }

    button:active {
      scale: 0.96;
    }

    button {
      transition-property: background-color, color, scale;
      transition-duration: 120ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hud {
      transition: none;
    }

    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }

  @media (forced-colors: active) {
    .box-layer, .box-content { background: Canvas; border-color: CanvasText; }
    .box-label, .box-side, .box-content > span, .box-dimensions { color: CanvasText; }

    :host {
      --refer-ink: CanvasText;
      --refer-muted: CanvasText;
      --refer-faint: CanvasText;
      --refer-panel: Canvas;
      --refer-panel-raised: ButtonFace;
      --refer-line: CanvasText;
      --refer-accent: Highlight;
      forced-color-adjust: auto;
    }

    .highlight {
      border: 2px solid Highlight;
      background: transparent;
      box-shadow: none;
    }

    .highlight-fill { background: transparent; }
    .highlight-edge { background: Highlight; }

    .chip,
    .hud,
    .toast {
      border: 1px solid CanvasText;
      box-shadow: none;
    }

    .swatch {
      outline-color: CanvasText;
    }
  }

  @media (max-width: 420px) {
    .chip { gap: 4px; padding-inline-start: 8px; max-width: calc(100vw - 16px); }
    .chip-label { font-size: 12px; }
    .chip button { padding-inline: 8px; font-size: 12px; }
  }

  @media (max-width: 360px) {
    .hud {
      inline-size: calc(100vw - 16px);
    }

    .hint {
      display: none;
    }

    .toast {
      max-inline-size: calc(100vw - 16px);
      white-space: normal;
    }
  }
`;
