import React, {createContext, useContext} from 'react';
import {Platform, useColorScheme, type TextStyle} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {useFonts} from 'expo-font';
import source from './design-tokens.json';

/** Only source of palette values. Aliases keep existing feature consumers compatible. */
function palette(colors: typeof source.colors.light) {
  return {...colors, paper: colors.background, ink: colors.primaryText,
    muted: colors.secondaryText, faint: colors.mutedText, danger: colors.error,
    onDanger: colors.inverseText, button: colors.accent, onButton: colors.onAccent};
}
export const palettes = {light: palette(source.colors.light), dark: palette(source.colors.dark)};
export type Palette = typeof palettes.light;
export const tokens = {
  space: source.spacing, radii: source.radii, radius: source.radii.medium,
  width: source.geometry.contentWidth, touch: source.geometry.touch,
  geometry: source.geometry, elevation: source.elevation,
  fonts: {editorial: 'DMSerifDisplay', body: Platform.select({ios: 'System', default: 'sans-serif'})},
  type: {...source.typography, title: source.typography.heading} as Record<keyof typeof source.typography | 'title', TextStyle>,
} as const;
export type Typography = keyof typeof tokens.type;
const fallback = Platform.select({ios: 'Georgia', default: 'serif'});
const FontContext = createContext({ready: true, fontFamily: fallback});
export function DesignSystemProvider({children}: React.PropsWithChildren) {
  const [loaded, error] = useFonts({DMSerifDisplay: require('../assets/welcome/DMSerifDisplay-Regular.ttf')});
  const dark = useColorScheme() === 'dark';
  return <FontContext.Provider value={{ready: loaded || Boolean(error), fontFamily: loaded ? tokens.fonts.editorial : fallback}}>
    <StatusBar style={dark ? 'light' : 'dark'}/>
    {children}
  </FontContext.Provider>;
}
export function useTypography() {return useContext(FontContext);}
export function usePalette() {return useColorScheme() === 'dark' ? palettes.dark : palettes.light;}
const editorial: Typography[] = ['display', 'hero', 'heading', 'title', 'editorHeading', 'sheetHeading', 'nativeHeading'];
export function useTypeStyle(role: Typography): TextStyle {
  const {fontFamily} = useTypography();
  return {...tokens.type[role], fontFamily: editorial.includes(role) ? fontFamily : tokens.fonts.body};
}
