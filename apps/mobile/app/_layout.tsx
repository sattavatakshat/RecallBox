import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
export default function Root() { return <SafeAreaProvider><SessionProvider><StatusBar style="auto"/><Stack screenOptions={{headerShown: false}}/></SessionProvider></SafeAreaProvider>; }
