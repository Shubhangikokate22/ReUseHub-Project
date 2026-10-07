import { Image, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

const symbols: Record<string, SymbolViewProps['name']> = {
  home: { ios: 'house.fill', android: 'home', web: 'home' } as SymbolViewProps['name'],
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' } as SymbolViewProps['name'],
  add: { ios: 'plus', android: 'add', web: 'add' } as SymbolViewProps['name'],
  chat: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' } as SymbolViewProps['name'],
  profile: { ios: 'person.fill', android: 'person', web: 'person' } as SymbolViewProps['name'],
  heart: { ios: 'heart', android: 'favorite', web: 'favorite' } as SymbolViewProps['name'],
  heartFill: { ios: 'heart.fill', android: 'favorite', web: 'favorite' } as SymbolViewProps['name'],
  bell: { ios: 'bell', android: 'notifications', web: 'notifications' } as SymbolViewProps['name'],
  filter: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' } as SymbolViewProps['name'],
  sort: { ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' } as SymbolViewProps['name'],
  book: { ios: 'book.closed.fill', android: 'menu_book', web: 'menu_book' } as SymbolViewProps['name'],
  laptop: { ios: 'laptopcomputer', android: 'laptop', web: 'laptop' } as SymbolViewProps['name'],
  clothing: { ios: 'tshirt.fill', android: 'checkroom', web: 'checkroom' } as SymbolViewProps['name'],
  bag: { ios: 'backpack.fill', android: 'backpack', web: 'backpack' } as SymbolViewProps['name'],
  chair: { ios: 'chair.lounge.fill', android: 'chair', web: 'chair' } as SymbolViewProps['name'],
  science: { ios: 'flask.fill', android: 'science', web: 'science' } as SymbolViewProps['name'],
  art: { ios: 'paintpalette.fill', android: 'palette', web: 'palette' } as SymbolViewProps['name'],
  sports: { ios: 'figure.run', android: 'sports_soccer', web: 'sports_soccer' } as SymbolViewProps['name'],
  games: { ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' } as SymbolViewProps['name'],
  hostel: { ios: 'bed.double.fill', android: 'bed', web: 'bed' } as SymbolViewProps['name'],
  study: { ios: 'pencil.and.list.clipboard', android: 'school', web: 'school' } as SymbolViewProps['name'],
  accessories: { ios: 'backpack.fill', android: 'backpack', web: 'backpack' } as SymbolViewProps['name'],
  other: { ios: 'square.grid.2x2', android: 'category', web: 'category' } as SymbolViewProps['name'],
  category: { ios: 'square.grid.2x2.fill', android: 'category', web: 'category' } as SymbolViewProps['name'],
  location: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } as SymbolViewProps['name'],
  sell: { ios: 'tag.fill', android: 'sell', web: 'sell' } as SymbolViewProps['name'],
  exchange: { ios: 'arrow.left.arrow.right', android: 'swap_horiz', web: 'swap_horiz' } as SymbolViewProps['name'],
  donate: { ios: 'hands.sparkles.fill', android: 'volunteer_activism', web: 'volunteer_activism' } as SymbolViewProps['name'],
  impact: { ios: 'leaf.fill', android: 'eco', web: 'eco' } as SymbolViewProps['name'],
  co2: { ios: 'cloud.fill', android: 'cloud', web: 'cloud' } as SymbolViewProps['name'],
  waste: { ios: 'trash.slash.fill', android: 'delete_sweep', web: 'delete_sweep' } as SymbolViewProps['name'],
  achievement: { ios: 'rosette', android: 'workspace_premium', web: 'workspace_premium' } as SymbolViewProps['name'],
  goal: { ios: 'target', android: 'track_changes', web: 'track_changes' } as SymbolViewProps['name'],
  settings: { ios: 'gearshape.fill', android: 'settings', web: 'settings' } as SymbolViewProps['name'],
  edit: { ios: 'pencil', android: 'edit', web: 'edit' } as SymbolViewProps['name'],
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' } as SymbolViewProps['name'],
  close: { ios: 'xmark', android: 'close', web: 'close' } as SymbolViewProps['name'],
  chevron: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' } as SymbolViewProps['name'],
  report: { ios: 'flag.fill', android: 'report', web: 'report' } as SymbolViewProps['name'],
  star: { ios: 'star.fill', android: 'star', web: 'star' } as SymbolViewProps['name'],
};

export type AppIconName = keyof typeof symbols;

export function AppIcon({ name, size = 20, color = '#64756A' }: { name: AppIconName; size?: number; color?: string }) {
  return <SymbolView name={symbols[name]} size={size} tintColor={color} />;
}

export function IconContainer({ icon, size = 44, background = '#E9F1E5', active = false, color, style }: {
  icon: keyof typeof symbols;
  size?: number;
  background?: string;
  active?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const iconSize = Math.round(size * 0.46);
  return <View style={[{ width: size, height: size, borderRadius: Math.round(size * 0.32), alignItems: 'center', justifyContent: 'center', backgroundColor: active ? '#DDEFE0' : background }, style]}>
    <AppIcon name={icon} size={iconSize} color={color ?? (active ? '#237A57' : '#4C7657')} />
  </View>;
}

export function BrandMark({ size = 38, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image accessibilityLabel="ReUseHub circular community logo" source={require('@/assets/branding/reusehub-mark.png')} resizeMode="contain" style={[{ width: size, height: size }, style]} />;
}

export function BrandLockup({ size = 36, fontSize = 18, subtitle, style }: { size?: number; fontSize?: number; subtitle?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>
    <BrandMark size={size} />
    <View><Text style={{ color: '#183B2E', fontSize, fontWeight: '800', letterSpacing: -0.6 }}>ReUseHub</Text>{subtitle ? <Text style={{ color: '#78867B', fontSize: 10, marginTop: 1 }}>{subtitle}</Text> : null}</View>
  </View>;
}
