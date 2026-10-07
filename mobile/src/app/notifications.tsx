import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActionButton, cardStyle, EmptyState, ErrorState, LoadingState, PageShell } from '@/components/page-shell';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api';

type Notice = { id: string; type: string; message: string; readAt: string | null; createdAt: string; actor: { id: string; name: string } | null; exchangeRequest: { id: string; item: { id: string; title: string } } | null };
type Result = { notifications: Notice[]; unreadCount: number };
export default function NotificationsScreen() {
  const { token } = useAuth(); const router = useRouter(); const [rows,setRows]=useState<Notice[]>([]); const [unread,setUnread]=useState(0); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const load=useCallback(async()=>{if(!token)return;setLoading(true);setError('');try{const data=await apiRequest<Result>('/notifications?limit=50',{token});setRows(data.notifications);setUnread(data.unreadCount);}catch(e){setError(e instanceof Error?e.message:'Could not load notifications.');}finally{setLoading(false);}},[token]);
  // Fetch the inbox when the route mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{void load();},[load]);
  const mark=async(id:string)=>{if(!token)return;const wasUnread=rows.some((entry)=>entry.id===id&&!entry.readAt);try{await apiRequest(`/notifications/${id}/read`,{method:'PATCH',token});setRows((all)=>all.map((n)=>n.id===id?{...n,readAt:new Date().toISOString()}:n));if(wasUnread)setUnread((n)=>Math.max(0,n-1));}catch(e){setError(e instanceof Error?e.message:'Could not mark notification as read.');}};
  const markAll=async()=>{if(!token)return;try{await apiRequest('/notifications/read-all',{method:'PATCH',token});setRows((all)=>all.map((n)=>({...n,readAt:n.readAt??new Date().toISOString()})));setUnread(0);}catch(e){setError(e instanceof Error?e.message:'Could not mark notifications as read.');}};
  return <PageShell title="Notifications" eyebrow="CAMPUS UPDATES" action={unread>0?<ActionButton label="Mark all read" tone="quiet" onPress={()=>void markAll()}/>:undefined}>
    {loading?<LoadingState/>:null}{error?<ErrorState message={error}/>:null}{!loading&&!rows.length?<EmptyState message="You are all caught up. New item requests and handoff updates will appear here."/>:null}
    {rows.map((n)=><Pressable key={n.id} onPress={()=>{void mark(n.id);if(n.exchangeRequest)router.push({pathname:'/item/[id]',params:{id:n.exchangeRequest.item.id}});}} style={[cardStyle,{borderColor:n.readAt?'#E7ECE5':'#C9DDCC',backgroundColor:n.readAt?'#FFFFFF':'#F1F7F0'}]}>
      <View style={{flexDirection:'row',alignItems:'center',gap:8}}><Text style={{flex:1,color:'#294735',fontSize:13,fontWeight:'700'}}>{n.actor?.name??'ReUseHub'}</Text>{!n.readAt?<Text style={{color:'#32805A',fontSize:9,fontWeight:'800'}}>NEW</Text>:null}</View>
      <Text style={{color:'#657268',fontSize:12,lineHeight:18,marginTop:5}}>{n.message}</Text><Text style={{color:'#97A097',fontSize:10,marginTop:9}}>{new Date(n.createdAt).toLocaleString()}</Text>
    </Pressable>)}
  </PageShell>;
}
