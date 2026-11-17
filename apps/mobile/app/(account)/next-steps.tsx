import {useEffect} from 'react';
import {router, useLocalSearchParams} from 'expo-router';
import {Notice, Screen} from '../../src/ui';

/** Preserve old links while retiring the normal Next Steps detour. */
export default function NextSteps() {
  const {memoryId} = useLocalSearchParams<{memoryId?: string}>();
  useEffect(() => {
    if (memoryId) router.dismissTo({pathname: '/(account)/memory/[id]', params: {id: memoryId}});
    else router.replace('/(account)');
  }, [memoryId]);
  return <Screen><Notice>Opening the saved memory…</Notice></Screen>;
}
