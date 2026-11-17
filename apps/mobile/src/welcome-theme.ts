/** Compatibility exports; all values are owned by the central design system. */
import {palettes, tokens} from './theme';
export const welcomeTheme = palettes;
export const welcomeTokens = {
  contentWidth: tokens.geometry.welcomeWidth,
  horizontalSpace: tokens.geometry.screenPadding,
  logoSize: 46, // Approved custom bookmark lockup geometry, not a generic icon.
  buttonHeight: tokens.geometry.heroButtonHeight,
  buttonRadius: tokens.radii.button,
  headlineFont: tokens.fonts.editorial,
} as const;
