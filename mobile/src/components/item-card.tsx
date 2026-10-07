import { Image } from 'expo-image';
import { Pressable, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { AppIcon } from '@/components/app-icon';
import { API_BASE_URL } from '@/lib/api';
import type { Item } from '@/types/models';

type Props = { item: Item; onPress: () => void; compact?: boolean; saved?: boolean; onToggleSaved?: () => void };

export function ItemCard({ item, onPress, compact = false, saved = false, onToggleSaved }: Props) {
  const imageUrl = item.images[0]?.url ? `${API_BASE_URL.replace(/\/api$/, '')}${item.images[0].url}` : null;
  const typeLabel = item.exchangeType === 'DONATION' ? 'DONATION' : item.exchangeType === 'SALE' ? 'FOR SALE' : 'EXCHANGE';
  const typeIcon = item.exchangeType === 'DONATION' ? 'donate' : item.exchangeType === 'SALE' ? 'sell' : 'exchange';
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [compact ? styles.compactMedia : styles.media, pressed && styles.pressed]}>
        {imageUrl ? <Image source={{ uri: imageUrl }} contentFit="cover" transition={150} style={styles.image} /> : <View style={[styles.image, styles.imagePlaceholder]}><AppIcon name="category" size={27} color="#6B9277" /><Text style={styles.placeholderText}>Ready to reuse</Text></View>}
        <View style={styles.topBadge}><View style={[styles.type, item.exchangeType === 'DONATION' && styles.donation, item.exchangeType === 'SALE' && styles.sale]}><AppIcon name={typeIcon} size={12} color={item.exchangeType === 'DONATION' ? '#8A6132' : item.exchangeType === 'SALE' ? '#79522A' : '#237A57'} /><Text style={[styles.typeText, item.exchangeType === 'DONATION' && styles.donationText, item.exchangeType === 'SALE' && styles.saleText]}>{typeLabel}</Text></View></View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={saved ? 'Remove from saved items' : 'Save item'} accessibilityState={{ checked: saved }} onPress={onToggleSaved} disabled={!onToggleSaved} style={styles.heartButton}><AppIcon name={saved ? 'heartFill' : 'heart'} size={18} color={saved ? '#B84D58' : '#47584D'} /></Pressable>
      <Pressable onPress={onPress} style={styles.content}>
        <Text numberOfLines={1} style={styles.category}>{item.category.name}</Text>
        <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
        {item.exchangeType === 'SALE' && item.price != null ? <Text style={styles.price}>Rs {Number(item.price).toFixed(2)}{item.priceNegotiable ? ' · negotiable' : ''}</Text> : null}
        <View style={styles.footer}><View style={styles.location}><AppIcon name="location" size={13} color="#87948A" /><Text style={styles.owner}>Campus pickup</Text></View><Text style={styles.condition}>{item.condition.replace('_', ' ')}</Text></View>
      </Pressable>
    </View>
  );
}

const styles = {
  card: { width: 244, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7ECE5', overflow: 'hidden', position: 'relative' as const },
  compact: { width: '100%', flexDirection: 'row' as const, minHeight: 124 },
  media: { width: '100%' },
  compactMedia: { width: 112, minHeight: 124 },
  image: { width: '100%', height: 150, backgroundColor: '#E8EFE8' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E7F0E7' },
  placeholderText: { color: '#6D8A77', fontSize: 11, fontWeight: '600', marginTop: 5 },
  topBadge: { position: 'absolute' as const, bottom: 9, left: 9 },
  heartButton: { position: 'absolute' as const, right: 9, top: 9, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.96)', alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 2, elevation: 2 },
  type: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#E5F3E8', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  typeText: { color: '#237A57', fontSize: 9, fontWeight: '800' as const, letterSpacing: 0.6 },
  donationText: { color: '#8A6132' },
  saleText: { color: '#79522A' },
  donation: { color: '#8A6132', backgroundColor: '#F7EEDC' },
  sale: { color: '#79522A', backgroundColor: '#F7EDDA' },
  content: { padding: 13, flex: 1, minWidth: 0 },
  category: { color: '#758178', fontSize: 11, fontWeight: '600' },
  title: { color: '#1F3429', fontSize: 15, lineHeight: 19, fontWeight: '700', marginTop: 6 },
  price: { color: '#32704C', fontSize: 12, fontWeight: '700', marginTop: 5 },
  footer: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, gap: 5, marginTop: 'auto' as const, paddingTop: 10 },
  location: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, flex: 1 },
  owner: { color: '#7B877E', fontSize: 10 },
  condition: { color: '#596A5F', fontSize: 10, fontWeight: '700' },
  pressed: { opacity: 0.85 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
