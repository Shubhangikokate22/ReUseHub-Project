import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PageShell } from '@/components/page-shell';
import { useAuth, type User } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Result={user:User};
export default function EditProfileScreen(){const{user,token,setProfile}=useAuth();const router=useRouter();const[name,setName]=useState(user?.name??'');const[email,setEmail]=useState(user?.email??'');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  async function save(){if(!token)return;const trimmedName=name.trim();const trimmedEmail=email.trim();if(trimmedName.length<2||trimmedName.length>100){setError('Name must be between 2 and 100 characters.');return;}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)){setError('Enter a valid email address.');return;}setBusy(true);setError('');try{const result=await apiRequest<Result>('/auth/me',{method:'PUT',token,body:{name:trimmedName,email:trimmedEmail}});setProfile(result.user);Alert.alert('Profile updated','Your account details have been saved.');router.back();}catch(e){setError(e instanceof Error?e.message:'Could not update your profile.');}finally{setBusy(false);}}
  return <PageShell title="Edit profile" eyebrow="YOUR ACCOUNT"><Text style={{color:'#7D8A80',fontSize:12,lineHeight:18}}>Keep your contact details up to date for item handoffs.</Text>
    <View style={{marginTop:20}}><Text style={{color:'#3B5143',fontSize:12,fontWeight:'700',marginBottom:7}}>Name</Text><TextInput accessibilityLabel="Name" value={name} onChangeText={setName} autoCapitalize="words" maxLength={100} style={{height:48,borderRadius:12,borderWidth:1,borderColor:'#DFE6DD',backgroundColor:'#FFFFFF',paddingHorizontal:13,color:'#2B4033'}}/></View>
    <View style={{marginTop:15}}><Text style={{color:'#3B5143',fontSize:12,fontWeight:'700',marginBottom:7}}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254} style={{height:48,borderRadius:12,borderWidth:1,borderColor:'#DFE6DD',backgroundColor:'#FFFFFF',paddingHorizontal:13,color:'#2B4033'}}/></View>
    {error?<Text accessibilityRole="alert" style={{color:'#A3463A',fontSize:12,marginTop:13}}>{error}</Text>:null}
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void save()} style={{height:48,alignItems:'center',justifyContent:'center',borderRadius:13,backgroundColor:'#237A57',marginTop:22,opacity:busy?0.65:1}}>{busy?<ActivityIndicator color="#FFFFFF"/>:<Text style={{color:'#FFFFFF',fontSize:13,fontWeight:'700'}}>Save profile</Text>}</Pressable>
  </PageShell>;
}
