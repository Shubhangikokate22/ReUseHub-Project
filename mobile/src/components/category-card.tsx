import { Pressable, Text, type ViewStyle } from 'react-native';
import { IconContainer, type AppIconName } from '@/components/app-icon';
import type { Category } from '@/types/models';

const iconBySlug: Record<string, AppIconName> = {
  books: 'book', study: 'study', 'books-study': 'study', electronics: 'laptop', clothing: 'clothing',
  bags: 'accessories', accessories: 'accessories', furniture: 'chair', stationery: 'study',
  sports: 'sports', games: 'games', 'hostel-essentials': 'hostel', hostel: 'hostel',
  'lab-equipment': 'science', 'lab-academic': 'science', academic: 'science', 'art-craft': 'art', art: 'art', other: 'other', others: 'other',
};
const tints = ['#E9F1E5', '#F4EEE1', '#E8EFF1', '#F2EAF0', '#E7F0EA', '#F2EEE4'];

export function CategoryCard({ category, index = 0, onPress, style, active = false }: {
  category: Category;
  index?: number;
  onPress: () => void;
  style?: ViewStyle;
  active?: boolean;
}) {
  const icon = iconBySlug[category.slug.toLowerCase()] ?? 'other';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Browse ${category.name}`} accessibilityState={{ selected: active }} onPress={onPress} style={[{ width: 82, alignItems: 'center' }, style]}>
    <IconContainer icon={icon} size={50} active={active} background={tints[index % tints.length]} />
    <Text numberOfLines={1} style={{ color: active ? '#237A57' : '#657268', fontSize: 10, marginTop: 7, fontWeight: '600', textAlign: 'center', width: '100%' }}>{category.name}</Text>
  </Pressable>;
}
