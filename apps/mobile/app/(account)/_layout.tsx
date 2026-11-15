import {Redirect, Stack, useSegments} from 'expo-router';
import {View} from 'react-native';
import {useSession} from '../../src/session';
import {MemoryProvider} from '../../src/memories';
import {BottomNavigation} from '../../src/navigation';
import {Notice, Screen, usePalette} from '../../src/ui';

export default function Protected() {
  const {account, loading} = useSession();
  const p = usePalette();
  const segments = useSegments();
  const leaf = segments.length ? String(segments[segments.length - 1]) : '';
  // The primary bar belongs to destinations, not editors, memory details or modals.
  const isHome = leaf === '(account)' || leaf === 'index';
  const isSearch = leaf === 'search';
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
