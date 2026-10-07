import { Tabs, TabList, TabTrigger, TabSlot, type TabTriggerSlotProps } from 'expo-router/ui';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/components/app-icon';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

const destinations = [
  { name: 'home', href: '/home', label: 'Home', icon: 'home' },
  { name: 'explore', href: '/explore', label: 'Explore', icon: 'search' },
  { name: 'add', href: '/add', label: 'Sell', icon: 'add', prominent: true },
  { name: 'chats', href: '/chats', label: 'Chats', icon: 'chat' },
  { name: 'profile', href: '/profile', label: 'Profile', icon: 'profile' },
] as const;

export default function AppTabs() {
  const router = useRouter(); const [sellOpen, setSellOpen] = useState(false);
  const { token } = useAuth(); const [unread, setUnread] = useState(0);
  const loadUnread = useCallback(async () => { if (!token) return; try { const result = await apiRequest<{ unreadCount: number }>('/chats', { token }); setUnread(result.unreadCount); } catch { /* Do not block tab navigation if chat counts are unavailable. */ } }, [token]);
  // Load the inbox badge once when the authenticated tab shell mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadUnread(); }, [loadUnread]);
  return <>
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList style={styles.tabBar}>
        {destinations.map((destination) => destination.name === 'add'
          ? <Pressable key={destination.name} accessibilityRole="button" accessibilityLabel="Sell, exchange, or donate an item" onPress={() => setSellOpen(true)} style={styles.tabButton}><View style={[styles.iconWell, styles.centerWell]}><AppIcon name="add" size={25} color="#FFFFFF" /></View><Text style={[styles.tabLabel, styles.centerLabel]}>Sell</Text></Pressable>
          : <TabTrigger key={destination.name} name={destination.name} href={destination.href} asChild><TabButton icon={destination.icon} badge={destination.name === 'chats' ? unread : 0}>{destination.label}</TabButton></TabTrigger>)}
      </TabList>
    </Tabs>
    <Modal transparent visible={sellOpen} animationType="slide" onRequestClose={() => setSellOpen(false)}>
      <View style={styles.modalRoot}><Pressable accessibilityLabel="Close sell menu" style={styles.backdrop} onPress={() => setSellOpen(false)} /><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Share something useful</Text><Text style={styles.sheetHint}>Choose how another student can get your item</Text></View><Pressable accessibilityLabel="Close" onPress={() => setSellOpen(false)} style={styles.closeButton}><AppIcon name="close" size={18} color="#56715E" /></Pressable></View>
        {actions.map((action) => <Pressable key={action.type} onPress={() => { setSellOpen(false); router.push({ pathname: '/add', params: { type: action.type } }); }} style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.8 }]}><View style={[styles.actionIcon, { backgroundColor: action.tint }]}><AppIcon name={action.icon} size={21} color={action.color} /></View><View style={{ flex: 1 }}><Text style={styles.actionTitle}>{action.title}</Text><Text style={styles.actionHint}>{action.hint}</Text></View><AppIcon name="chevron" size={16} color="#99A49B" /></Pressable>)}
      </View></View>
    </Modal>
  </>;
}

function TabButton({ children, isFocused, icon, prominent = false, badge = 0, ...props }: TabTriggerSlotProps & { icon: 'home'|'search'|'add'|'chat'|'profile'; prominent?: boolean; badge?: number }) {
  return <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.tabButton}>
    <View style={[styles.iconWell, prominent && styles.centerWell, isFocused && !prominent && styles.activeWell]}><AppIcon name={icon} size={prominent ? 25 : 20} color={prominent ? '#FFFFFF' : isFocused ? '#237A57' : '#879188'} />{badge > 0 ? <View style={styles.badgeDot} /> : null}</View>
    <Text style={[styles.tabLabel, isFocused && styles.activeLabel, prominent && styles.centerLabel]}>{children}</Text>
  </Pressable>;
}

const styles = {
  tabBar: { position: 'absolute' as const, bottom: 0, width: '100%' as const, alignSelf: 'center' as const, maxWidth: 760, flexDirection: 'row' as const, justifyContent: 'space-around' as const, alignItems: 'flex-end' as const, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E8ECE6', paddingHorizontal: 7, paddingTop: 7, paddingBottom: 6, minHeight: 66, elevation: 12, shadowColor: '#1E3024', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } },
  tabButton: { flex: 1, minHeight: 52, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 2 },
  iconWell: { width: 38, height: 32, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 16 },
  activeWell: { backgroundColor: '#ECF4EC' },
  centerWell: { width: 48, height: 48, borderRadius: 17, backgroundColor: '#237A57', marginTop: -27, elevation: 5, shadowColor: '#1F553B', shadowOpacity: 0.24, shadowRadius: 7, shadowOffset: { width: 0, height: 3 } },
  tabLabel: { color: '#89938B', fontSize: 10, fontWeight: '600' as const },
  activeLabel: { color: '#237A57', fontWeight: '700' as const },
  badgeDot: { position: 'absolute' as const, top: 2, right: 1, width: 8, height: 8, borderRadius: 4, backgroundColor: '#BE5358', borderWidth: 1.5, borderColor: '#FFFFFF' },
  centerLabel: { color: '#315742', fontWeight: '700' as const },
  modalRoot: { flex: 1, justifyContent: 'flex-end' as const, backgroundColor: 'rgba(23,39,29,0.38)' },
  backdrop: { position: 'absolute' as const, top: 0, right: 0, bottom: 0, left: 0 },
  sheet: { backgroundColor: '#F8F9F5', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 9, paddingBottom: 24, width: '100%' as const, maxWidth: 700, alignSelf: 'center' as const },
  sheetHandle: { width: 37, height: 4, borderRadius: 3, backgroundColor: '#D5DDD4', alignSelf: 'center' as const, marginBottom: 15 },
  sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12 },
  sheetTitle: { color: '#20382B', fontSize: 20, fontWeight: '800' as const },
  sheetHint: { color: '#829087', fontSize: 11, marginTop: 4 },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#E9EFE8', alignItems: 'center' as const, justifyContent: 'center' as const },
  actionRow: { minHeight: 70, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECE5', borderRadius: 15, paddingHorizontal: 12, marginTop: 8 },
  actionIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  actionTitle: { color: '#304A38', fontSize: 13, fontWeight: '800' as const },
  actionHint: { color: '#859087', fontSize: 10, marginTop: 4 },
};

const actions = [
  { type: 'SALE', title: 'Sell item', hint: 'Set a price and arrange a campus pickup.', icon: 'sell' as const, tint: '#F7EFDF', color: '#956825' },
  { type: 'EXCHANGE', title: 'Exchange item', hint: 'Trade it for something you need.', icon: 'exchange' as const, tint: '#EAF1E7', color: '#4C7C5A' },
  { type: 'DONATION', title: 'Donate item', hint: 'Offer it to another student for free.', icon: 'donate' as const, tint: '#F3EAF0', color: '#86536E' },
];
