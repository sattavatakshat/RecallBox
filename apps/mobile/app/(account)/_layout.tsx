import {Redirect, Stack, useSegments} from 'expo-router';
import {View} from 'react-native';
import {useSession} from '../../src/session';
import {MemoryProvider, useMemories} from '../../src/memories';
import {BottomNavigation, type Destination} from '../../src/navigation';
import {isUsableMemory} from '../../src/library-state';
import {Notice, Screen, usePalette} from '../../src/ui';

function AccountNavigation({active}: {active: Destination}) {
  const store = useMemories();
  const emptyLibrary = active === 'library' && !store.archived && !store.starredOnly &&
    !store.items.some(isUsableMemory);
  return <BottomNavigation active={active} showSave={!emptyLibrary} approved={emptyLibrary}/>;
}

export default function Protected() {
  const {account, loading} = useSession();
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
      {showTabs && <AccountNavigation active={isSearch ? 'search' : isCollections ? 'collections' : 'library'}/>}
    </View>
  </MemoryProvider>;
}
