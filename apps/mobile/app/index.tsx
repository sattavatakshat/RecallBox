import React from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View,
  useWindowDimensions,
} from 'react-native';
import {Redirect} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useSession} from '../src/session';
import {useNativeLogin} from '../src/use-native-login';
import {tokens, usePalette} from '../src/ui';

/**
 * RB-01. Reference: docs/UX/RecallBox_Interactive_Prototype.html screenWelcome().
 *
 * Keep this a visually distinct entry page, NOT a generic Screen wrapper:
 * the field-notebook prototype has its own header, title, bookmark art and
 * bottom-anchored CTA. The secure Auth0 flow is real, not simulated.
 */
function BookmarkMark({size, color}: {size: number; color: string}) {
  const line = Math.max(2, size * 0.055);
  const width = size * 0.68;
  const height = size * 0.82;
  return <View importantForAccessibility="no-hide-descendants" style={{
    width: size, height: size, alignItems: 'center', justifyContent: 'center',
  }}>
    <View style={{width, height, position: 'relative'}}>
      <View style={{
        position: 'absolute', left: 0, top: 0, width, height: line,
        backgroundColor: color, borderRadius: line,
      }}/>
      <View style={{
        position: 'absolute', left: 0, top: 0, width: line, height: height - size * 0.17,
        backgroundColor: color, borderRadius: line,
      }}/>
      <View style={{
        position: 'absolute', right: 0, top: 0, width: line, height: height - size * 0.17,
        backgroundColor: color, borderRadius: line,
      }}/>
      <View style={{
        position: 'absolute', left: -1, bottom: size * 0.055,
        width: width * 0.55, height: line, backgroundColor: color,
        borderRadius: line, transform: [{rotate: '-31deg'}],
      }}/>
      <View style={{
        position: 'absolute', right: -1, bottom: size * 0.055,
        width: width * 0.55, height: line, backgroundColor: color,
        borderRadius: line, transform: [{rotate: '31deg'}],
      }}/>
    </View>
  </View>;
}

function AccountMark({color}: {color: string}) {
  return <View importantForAccessibility="no-hide-descendants"
    style={{width: 20, height: 23, alignItems: 'center', justifyContent: 'center'}}>
    <View style={{width: 7, height: 7, borderRadius: 4, borderWidth: 1.6, borderColor: color}}/>
    <View style={{
      width: 15, height: 9, borderTopLeftRadius: 10, borderTopRightRadius: 10,
      borderWidth: 1.6, borderBottomWidth: 0, borderColor: color, marginTop: 2,
    }}/>
  </View>;
}

export default function Welcome() {
  const session = useSession();
  const {login, busy, error, configured} = useNativeLogin();
  const p = usePalette();
  const {width} = useWindowDimensions();
  if (session.account) return <Redirect href="/(account)"/>;

  function privacy() {
    Alert.alert(
      'Privacy and your data',
      'RecallBox saves content to your account and processes supported sources to make them searchable. Your content is not end-to-end encrypted. You control what you save and can manage it after signing in.',
      [{text: 'Got it'}],
    );
  }

  return <SafeAreaView edges={['top', 'bottom']} style={{flex: 1, backgroundColor: p.paper}}>
    <ScrollView contentContainerStyle={{flexGrow: 1}}
      showsVerticalScrollIndicator={false}>
      <View style={{
        flexGrow: 1, paddingHorizontal: 26, paddingTop: 34, paddingBottom: 22,
        justifyContent: 'space-between', minHeight: 650,
      }}>
        <View>
          <View style={{flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between'}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 9}}>
              <View style={{
                width: 29, height: 29, borderRadius: 8, backgroundColor: '#284D3B',
                justifyContent: 'center', alignItems: 'center',
              }}>
                <BookmarkMark size={19} color="#FFFFFF"/>
              </View>
              <Text style={{
                color: p.ink, fontSize: 16, letterSpacing: -0.5, fontWeight: '700',
              }}>recallbox</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Sign in"
              disabled={busy || session.loading} onPress={() => void login()}
              style={({pressed}) => ({
                width: 43, height: 43, borderRadius: 22,
                backgroundColor: p.surfaceMuted,
                justifyContent: 'center', alignItems: 'center',
                opacity: pressed || busy ? 0.7 : 1,
              })}>
              <AccountMark color={p.accent}/>
            </Pressable>
          </View>

          <View style={{marginTop: 76, marginBottom: 35}}>
            <Text style={{
              color: p.faint, fontSize: 10, lineHeight: 16,
              letterSpacing: 1.3, fontWeight: '700',
            }}>A PLACE FOR THE THINGS YOU SAVE</Text>
            <Text style={{
              color: p.ink, fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
              fontSize: width < 360 ? 46 : 52,
              lineHeight: width < 360 ? 51 : 57,
              letterSpacing: -2.2, fontWeight: '400',
              marginTop: 18, marginBottom: 22,
            }}>Keep the good{'\n'}things close.</Text>
            <Text style={{
              color: p.muted, fontSize: 14, lineHeight: 23,
            }}>Links, notes, screenshots and ideas.{'\n'}Saved once, ready when you need them.</Text>
          </View>

          <View style={{
            width: 115, height: 115, borderRadius: 25,
            backgroundColor: p.surfaceMuted,
            justifyContent: 'center', alignItems: 'center',
            transform: [{rotate: '-6deg'}],
          }}>
            <BookmarkMark size={43} color={p.accent}/>
          </View>
        </View>

        <View style={{gap: 8, marginTop: tokens.space.section}}>
          {!!error && <Text accessibilityRole="alert" style={{
            color: p.danger, fontSize: 13, lineHeight: 20, marginBottom: 7,
          }}>{error}</Text>}
          {!error && !!session.message && <Text style={{
            color: p.muted, fontSize: 13, lineHeight: 19,
          }}>{session.message}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="Continue securely"
            accessibilityState={{disabled: busy || session.loading, busy}}
            disabled={busy || session.loading} onPress={() => void login()}
            style={({pressed}) => ({
              minHeight: 49, borderRadius: 13,
              backgroundColor: p.accent,
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed || busy || session.loading ? 0.65 : 1,
              flexDirection: 'row', gap: 10,
              paddingHorizontal: 14,
            })}>
            {busy || session.loading
              ? <ActivityIndicator color={p.onAccent} accessibilityLabel="Opening secure sign-in"/>
              : <>
                  <Text style={{color: p.onAccent, fontWeight: '700', fontSize: 15}}>
                    Continue securely
                  </Text>
                  <Text style={{color: p.onAccent, fontSize: 19}}>→</Text>
                </>}
          </Pressable>
          <Text style={{
            textAlign: 'center', color: p.muted, fontSize: 12,
            lineHeight: 18, marginTop: 5,
          }}>
            {configured ? 'Secure sign-in opens in your browser.' :
              'Sign-in requires your configured identity provider.'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Privacy and your data"
            onPress={privacy} style={({pressed}) => ({
              minHeight: 44, alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.65 : 1,
            })}>
            <Text style={{color: p.accent, fontSize: 13, lineHeight: 19,
              fontWeight: '700'}}>Privacy and your data</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
