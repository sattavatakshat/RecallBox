import {Stack} from 'expo-router';
import {DesignSystemProvider} from '../src/theme';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {SessionProvider} from '../src/session';
export default function Root() { return <SafeAreaProvider><DesignSystemProvider><SessionProvider><Stack screenOptions={{headerShown: false}}/></SessionProvider></DesignSystemProvider></SafeAreaProvider>; }
