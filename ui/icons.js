/**
 * ============================================================
 * Kinojo SVG Icon Library
 * ------------------------------------------------------------
 * Purpose:
 * - Centralized SVG icon storage for the extension UI
 * - Used by main buttons, corner buttons, status controls,
 *   bug report button, and action indicators
 *
 * Notes:
 * - All icons inherit currentColor
 * - Stroke sizes are tuned for small UI rendering
 * - Icons are intentionally lightweight inline SVG strings
 * ============================================================
 */

window.AION2_ICONS = {

  /**
   * Start / Play
   * Used for:
   * - Main start button
   * - Resume actions
   */
  play: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.8"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M8 5.5v13l10-6.5-10-6.5z"
            fill="currentColor"
            stroke="none"/>
    </svg>
  `,


  /**
   * Pause / Stop
   * Used when auto-search is running
   */
  pause: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.8"
         stroke-linecap="round">
      <path d="M8 6v12M16 6v12"/>
    </svg>
  `,


  /**
   * Resume / Continue
   * Circular recovery-style icon
   */
  resume: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.4"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M4 12a8 8 0 0 1 13.6-5.7"/>
      <path d="M17.8 3.8v4.9h-4.9"/>
      <path d="M20 12a8 8 0 0 1-13.6 5.7"/>
      <path d="M6.2 20.2v-4.9h4.9"/>
    </svg>
  `,


  /**
   * Reset / Trash
   * Clears queue or resets local state
   */
  trash: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.3"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M4 7h16"/>
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/>
      <path d="M6.5 7l.8 12A2 2 0 0 0 9.3 21h5.4a2 2 0 0 0 2-2l.8-12"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
  `,


  /**
   * Auto Mode / Protected State
   * Used for:
   * - Auto search
   * - Safe/locked actions
   */
  shield: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.3"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M12 3l7 3v5c0 4.8-2.9 8.5-7 10-4.1-1.5-7-5.2-7-10V6l7-3z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  `,


  /**
   * Home / Index
   * Opens index or returns to main page
   */
  home: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.3"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M4 11.5L12 5l8 6.5"/>
      <path d="M6.5 10.5V20h11v-9.5"/>
      <path d="M10 20v-5h4v5"/>
    </svg>
  `,


  /**
   * Bug Report
   * Used for:
   * - Problem report button
   * - Debug related actions
   */
  bug: `
    <svg viewBox="0 0 24 24"
         fill="none"
         stroke-width="2.2"
         stroke-linecap="round"
         stroke-linejoin="round">
      <path d="M8 8h8"/>
      <path d="M9 4l1.5 3"/>
      <path d="M15 4l-1.5 3"/>
      <rect x="7" y="7" width="10" height="13" rx="5"/>
      <path d="M3 13h4"/>
      <path d="M17 13h4"/>
      <path d="M4 20l3-3"/>
      <path d="M20 20l-3-3"/>
    </svg>
  `
};