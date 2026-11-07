import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../src/session';
import { MemoryProvider } from '../../src/memories';
import { Notice, Screen } from '../../src/ui';
export default function Protected() {
  const {account, loading} = useSession();
  if (loading && !account) return <Screen><Notice>Restoring your session…</Notice></Screen>;
  if (!account) return <Redirect href="/sign-in"/>;
  return <MemoryProvider key={account.id}><Stack screenOptions={{headerShown: false}}/></MemoryProvider>;
}
