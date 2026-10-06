/**
 * Base styles
 * for translation elements
 */

export const BASE_STYLES = `
/* Base */
.wxt-word-container {
  display: inline;
  position: relative;
}

.wxt-chinese {
  display: inline;
}

.wxt-original-word {
  background: linear-gradient(to right, var(--wxt-primary-color) 0%, var(--wxt-primary-color) 50%, transparent 50%, transparent 100%) repeat-x left bottom;
  background-size: 8px 2px;
  padding-bottom: 2px;
}

.wxt-english {
  display: inline;
  margin-left: 4px;
  font-size: 0.9em;
  vertical-align: baseline;
}

/* Learning mode */
.wxt-translation-term--learning {
  filter: blur(5px);
  cursor: pointer;
  color: var(--wxt-primary-color);
  transition: filter 0.2s ease-in-out;
}

.wxt-translation-term--learning:hover {
  filter: blur(0);
}

/* Learning mode original text, with full hover support */
.wxt-original-word--learning {
  filter: blur(5px);
  cursor: pointer;
  transition: filter 0.2s ease-in-out;
}

.wxt-original-word--learning:hover {
  filter: blur(0) !important;
}

/* Hover support for learning mode inside links */
a .wxt-original-word--learning:hover,
a:hover .wxt-original-word--learning {
  filter: blur(0) !important;
}

/* Two-layer phrase interaction */
.wxt-has-word-overlay {
  position: relative !important;
}

.wxt-word-hover-area {
  position: absolute;
  pointer-events: auto;
  z-index: 1;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.2s ease;
  border-radius: 2px;
}

.wxt-word-hover-area:hover {
  background-color: rgba(106, 136, 224, 0.1) !important;
}

.wxt-word-hover-area.wxt-pronunciation-enabled:hover {
  background-color: rgba(106, 136, 224, 0.15) !important;
}

/* Processing state */
.wxt-processing {
  pointer-events: none !important;
}

/* Links stay clickable while processing */
a.wxt-processing,
a.wxt-processing *,
.wxt-processing a,
.wxt-processing a * {
  pointer-events: auto !important;
  cursor: pointer !important;
}

/* Buttons stay clickable while processing */
button.wxt-processing,
button.wxt-processing *,
.wxt-processing button,
.wxt-processing button * {
  pointer-events: auto !important;
  cursor: pointer !important;
}

/* Clickable elements stay clickable while processing */
[onclick].wxt-processing,
[onclick].wxt-processing *,
.wxt-processing [onclick],
.wxt-processing [onclick] * {
  pointer-events: auto !important;
  cursor: pointer !important;
}


/* Error state */
.wxt-error {
  color: #ff6b6b !important;
  text-decoration: line-through;
}

/* Responsive */
@media (max-width: 768px) {
  .wxt-word-container {
    font-size: 14px;
  }

  .wxt-english {
    font-size: 0.85em;
  }
}

/* Animations */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ===== Translation visibility ===== */

/**
 * Global translation visibility.
 *
 * A class on <body> controls whether translated content is shown, which:
 * - avoids touching each element,
 * - applies automatically to translations added later,
 * - keeps every translation in the same state.
 */
.wxt-translation-hidden .wxt-translation-term {
  display: none !important;
}

/**
 * Visibility transitions
 * for showing and hiding translated content
 */
.wxt-translation-term {
  transition: opacity 0.2s ease-in-out;
}
`;
