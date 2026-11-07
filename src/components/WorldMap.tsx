import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { worldMap } from '../theme/svg-assets';
import { colors, fonts } from '../theme/tokens';
export default function WorldMap({ people = 0, cities = 0 }: { people?: number; cities?: number }) {
  const [zoom, setZoom] = useState(1);
  return (
    <View style={s.surface}>
      <View style={[StyleSheet.absoluteFill, { transform: [{ scale: zoom }] }]}>
        <SvgXml xml={worldMap} />
      </View>
      <View style={s.badge}>
        <Text style={s.text}>
          {people} {people === 1 ? 'friend' : 'friends'}, {cities}{' '}
          {cities === 1 ? 'city' : 'cities'}
        </Text>
      </View>
      <View style={s.controls}>
        {[
          { Icon: Minus, label: 'Zoom out', delta: -0.2 },
          { Icon: Plus, label: 'Zoom in', delta: 0.2 },
        ].map(({ Icon, label, delta }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => setZoom((z) => Math.max(1, Math.min(2.2, z + delta)))}
            style={s.control}
          >
            <Icon size={17} color={colors.tealDeep} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  surface: { height: 310, borderRadius: 28, backgroundColor: '#e6f5f2', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: 20,
    left: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 30,
    backgroundColor: '#ffffffee',
  },
  text: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  controls: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', gap: 6 },
  control: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
