import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Tabs } from 'expo-router';
import { Home, Compass, Bookmark, Users, Handshake } from 'lucide-react-native';
import { useAuth } from '../../providers/AuthProvider';
import { colors, fonts } from '../../theme/tokens';
export default function TabLayout() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      key={session?.user.id}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tealDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarActiveBackgroundColor: colors.soft,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingTop: 7,
          paddingBottom: 7 + insets.bottom,
          height: 76 + insets.bottom,
        },
        tabBarItemStyle: {
          borderRadius: 12,
          marginHorizontal: 4,
          marginBottom: 0,
          overflow: 'hidden',
        },
        tabBarLabelStyle: { fontFamily: fonts.bold, fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Home color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="nearby"
        options={{
          title: 'Nearby',
          tabBarIcon: ({ color }) => <Handshake color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{ title: 'Trips', tabBarIcon: ({ color }) => <Compass color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: 'Saved',
          tabBarIcon: ({ color }) => <Bookmark color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="communities"
        options={{ title: 'Groups', tabBarIcon: ({ color }) => <Users color={color} size={20} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
      <Tabs.Screen
        name="map"
        options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }}
      />
    </Tabs>
  );
}
