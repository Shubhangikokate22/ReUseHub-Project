import { Redirect } from 'expo-router';
import { Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useAuth } from '@/context/auth-context';
import { BrandMark } from '@/components/app-icon';

export default function IndexRoute() {
  const { ready, user } = useAuth();
  if (!ready) return <View style={styles.loading}><BrandMark size={82} /><Text style={styles.brand}>ReUseHub</Text><Text style={styles.tagline}>Campus. Reuse. Connect.</Text></View>;
  return <Redirect href={user ? '/home' : '/login'} />;
}

const styles = {
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8F3' },
  brand: { color: '#183B2E', fontSize: 25, fontWeight: '800', letterSpacing: -0.8, marginTop: 17 },
  tagline: { color: '#758379', fontSize: 12, fontWeight: '600', marginTop: 6, letterSpacing: 0.2 },
} satisfies Record<string, ViewStyle | TextStyle | ImageStyle>;
