import {Redirect, Stack, useSegments, usePathname, router} from 'expo-router';
import {useEffect} from 'react';
import {AppState} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {View} from 'react-native';
import {useSession} from '../../src/session';
import {MemoryProvider} from '../../src/memories';
import {BottomNavigation} from '../../src/navigation';
import {Notice, Screen, usePalette} from '../../src/ui';

export default function Protected() {
  const {account, loading} = useSession();
  const pathname = usePathname();
  useEffect(() => {
    if (!account || pathname.endsWith('/incoming-share')) return;
    const native = requireOptionalNativeModule<{
      activateShareAccount: (id: string) => Promise<boolean>;
      peekShare: () => Promise<string | null>;
    }>('RecallBoxCallback');
    let active = true;
    const check = async () => {
      try {
        if (!native || !(await native.activateShareAccount(account.id))) return;
        const pending = await native.peekShare();
        if (active && pending) router.push('/(account)/incoming-share');
      } catch { /* Old builds do not have an inbound share module. */ }
    };
    void check();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void check();
    });
    return () => { active = false; subscription.remove(); };
  }, [account?.id, pathname]);
  const p = usePalette();
  const segments = useSegments();
  const leaf = segments.length ? String(segments[segments.length - 1]) : '';
  // The primary bar belongs to destinations, not editors, memory details or modals.
  const isHome = leaf === '(account)' || leaf === 'index';
  const isSearch = leaf === 'search' || leaf === 'results';
  const isCollections = leaf === 'collections';
  const showTabs = segments.length <= 2 && (isHome || isSearch || isCollections);

  if (loading && !account) return <Screen><Notice>Restoring your session…</Notice></Screen>;
  if (!account) return <Redirect href="/sign-in"/>;

  return <MemoryProvider key={account.id}>
    <View style={{flex: 1, backgroundColor: p.paper}}>
      <Stack screenOptions={{headerShown: false}}>
        <Stack.Screen name="save" options={{
          presentation: 'transparentModal',
          animation: 'slide_from_bottom',
          contentStyle: {backgroundColor: 'transparent'},
        }}/>
      </Stack>
      {showTabs && <BottomNavigation active={isSearch ? 'search' : isCollections ? 'collections' : 'library'}/>}
    </View>
  </MemoryProvider>;
}
