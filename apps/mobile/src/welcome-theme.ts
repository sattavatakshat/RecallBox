/** RB-01 semantic tokens. Scoped here so other screens retain their palette. */
export const welcomeTheme = {
  light: {
    background: '#FCF4EA', primaryText: '#082F23', secondaryText: '#465052',
    brand: '#082F23', onBrand: '#FFF9EE', accent: '#CDE65F',
    button: '#063824', onButton: '#FFFDF5', decoration: '#E9EBCF',
    error: '#A43439',
  },
  dark: {
    background: '#091F15', primaryText: '#F7F5EB', secondaryText: '#E5E6DC',
    brand: '#E4F486', onBrand: '#102A1C', accent: '#CDE65F',
    button: '#DCEC7C', onButton: '#102312', decoration: '#23351B',
    error: '#FFB3AC',
  },
} as const;

export const welcomeTokens = {
  contentWidth: 390,
  horizontalSpace: 24,
  logoSize: 46,
  buttonHeight: 60,
  buttonRadius: 17,
  headlineFont: 'DMSerifDisplay',
} as const;
