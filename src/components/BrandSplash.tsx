import { StyleSheet, Text, View } from 'react-native';
import LogoMark from './LogoMark';
import { colors, fonts } from '../theme/tokens';
export default function BrandSplash() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Rendezwho" style={s.screen}>
      <LogoMark />
      <Text style={s.name}>Rendezwho</Text>
      <Text style={s.tagline}>PRIVATE TRAVEL NETWORK</Text>
    </View>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    padding: 24,
  },
  name: { fontFamily: fonts.serifSemibold, fontSize: 30, color: colors.ink, marginTop: 16 },
  tagline: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 1.62,
    color: colors.muted,
    marginTop: 4,
  },
});
