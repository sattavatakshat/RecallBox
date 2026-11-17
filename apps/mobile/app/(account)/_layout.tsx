import {Redirect, Stack, useSegments} from 'expo-router';
import {useEffect, useRef, useState} from 'react';
import {Keyboard, View} from 'react-native';
import {useSession} from '../../src/session';
import {MemoryProvider, useMemories} from '../../src/memories';
import {BottomNavigation, type Destination} from '../../src/navigation';
import {Notice, Screen, usePalette} from '../../src/ui';

export const unstable_settings = {initialRouteName:'index'};

function AccountNavigation({active}: {active: Destination}) {
  const store = useMemories();
  const emptyLibrary = active === 'library' && !store.archived && !store.starredOnly &&
    !store.topic && !store.items.length;
  return <BottomNavigation active={active} showSave={!emptyLibrary} approved={active === 'library'}/>;
}

export default function Protected() {
  const {account, loading} = useSession();
  const p = usePalette();
  const segments = useSegments();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {show.remove();hide.remove();};
  }, []);
  const leaf = segments.length ? String(segments[segments.length - 1]) : '';
  // The primary bar belongs to destinations, not editors, memory details or modals.
  const isHome = leaf === '(account)' || leaf === 'index';
  const isSearch = leaf === 'search' || leaf === 'results';
  const isCollections = leaf === 'collections';
  const lastTab = useRef<Destination>('library');
  if(isHome) lastTab.current='library';
  else if(isSearch) lastTab.current='search';
  else if(isCollections) lastTab.current='collections';
  // The native Modal covers the whole window, including these unchanged tabs.
  const showTabs = segments.length <= 2 && (isHome || isSearch || isCollections || leaf==='save');

  if (loading && !account) return <Screen><Notice>Restoring your session…</Notice></Screen>;
  if (!account) return <Redirect href="/sign-in"/>;

  return <MemoryProvider key={account.id}>
    <View style={{flex: 1, backgroundColor: p.paper}}>
      <Stack screenOptions={{headerShown: false}}>
        <Stack.Screen name="capture" options={{animation:'none'}}/>
        <Stack.Screen name="new" options={{animation:'none'}}/>
        <Stack.Screen name="new-link" options={{animation:'none'}}/>
        <Stack.Screen name="save" options={{
          presentation: 'transparentModal',
          animation: 'none',
          contentStyle: {backgroundColor: 'transparent'},
        }}/>
      </Stack>
      {showTabs && !(leaf === 'search' && keyboardVisible) && <AccountNavigation active={lastTab.current}/>}
    </View>
  </MemoryProvider>;
}
