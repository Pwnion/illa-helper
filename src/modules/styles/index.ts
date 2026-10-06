/**
 * Styles module index.
 * Re-exports every style module and class.
 */

// Style constants
import { CSS_VARIABLES } from './constants/variables';
import { BASE_STYLES } from './core/base';
import { TRANSLATION_STYLES } from './themes/translation';
import { PRONUNCIATION_STYLES } from './components/pronunciation';
import { TOOLTIP_STYLES } from './components/tooltip';

// Re-export style constants
export {
  CSS_VARIABLES,
  BASE_STYLES,
  TRANSLATION_STYLES,
  PRONUNCIATION_STYLES,
  TOOLTIP_STYLES,
};

// StyleManager is exported separately to avoid a circular dependency
export { StyleManager } from './core/StyleManager';

// Combined styles
export const ALL_STYLES = `
${CSS_VARIABLES}
${BASE_STYLES}
${TRANSLATION_STYLES}
${PRONUNCIATION_STYLES}
${TOOLTIP_STYLES}
`;
