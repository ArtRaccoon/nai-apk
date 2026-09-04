import AsyncStorage from '@react-native-async-storage/async-storage';
export type Session={token:string,user:{id:string,identifier:string}};
const base=process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
export async function getSession(){const x=await AsyncStorage.getItem('session');return x?JSON.parse(x) as Session:null}
export async function api(path:string,init:RequestInit={}){const s=await getSession();const r=await fetch(base+path,{...init,headers:{'Content-Type':'application/json',...(s?{Authorization:`Bearer ${s.token}`}:{}),...(init.headers||{})}});const data=await r.json();if(!r.ok)throw new Error(data.error||'Ошибка сервера');if(data.token)await AsyncStorage.setItem('session',JSON.stringify(data));return data}
