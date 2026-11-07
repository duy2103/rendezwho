import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Heading } from './ui';
import { colors } from '../theme/tokens';
export default function Sheet({
  title,
  visible,
  onClose,
  children,
}: PropsWithChildren<{ title: string; visible: boolean; onClose: () => void }>) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.container}
        >
          <View style={s.sheet}>
            <View style={s.header}>
              <Heading>{title}</Heading>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close dialog"
                onPress={onClose}
                style={s.close}
              >
                <X size={20} color={colors.tealDeep} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#44403c66', justifyContent: 'flex-end' },
  container: { width: '100%', maxWidth: 560, maxHeight: '95%', alignSelf: 'center' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.paper,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, gap: 18 },
});
