import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Bell, Plus, X, MessageCircle, UserRound } from 'lucide-react-native';
import { useAuth } from '../providers/AuthProvider';
import LogoMark from './LogoMark';
import { colors, fonts } from '../theme/tokens';
export default function AppHeader() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  if (!session) return null;
  return (
    <View style={s.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your profile"
        onPress={() => router.push('/profile')}
        style={s.brand}
      >
        <LogoMark compact />
        <Text style={s.name}>Rendezwho</Text>
      </Pressable>
      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notifications and account"
          onPress={() => setOpen(true)}
          style={s.icon}
        >
          <Bell size={19} color={colors.tealDeep} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add check-in"
          onPress={() => router.push({ pathname: '/trips', params: { add: String(Date.now()) } })}
          style={[s.icon, { backgroundColor: colors.sunset, borderWidth: 0 }]}
        >
          <Plus size={19} color={colors.ink} />
        </Pressable>
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel="Close notifications"
          onPress={() => setOpen(false)}
          style={s.backdrop}
        >
          <View style={s.menu}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={s.menuTitle}>Notifications</Text>
              <X size={18} color={colors.muted} />
            </View>
            <Text style={s.copy}>Keep in touch with your travel network.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                router.push('/messages');
              }}
              style={s.menuItem}
            >
              <MessageCircle size={18} color={colors.tealDeep} />
              <Text style={s.itemText}>Messages</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(false);
                router.push('/profile');
              }}
              style={s.menuItem}
            >
              <UserRound size={18} color={colors.tealDeep} />
              <Text style={s.itemText}>Your profile</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
const s = StyleSheet.create({
  header: {
    height: 68,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.canvas,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.serifSemibold, fontSize: 20, color: colors.ink },
  actions: { flexDirection: 'row', gap: 8 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#44403c22',
    alignItems: 'flex-end',
    padding: 20,
    paddingTop: 90,
  },
  menu: {
    width: 288,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    padding: 16,
    gap: 12,
  },
  menuTitle: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  copy: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    backgroundColor: colors.soft,
    borderRadius: 12,
  },
  itemText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.tealDeep },
});
