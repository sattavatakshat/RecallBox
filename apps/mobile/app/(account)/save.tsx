import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useBrandTheme} from '../../src/brand';
import {Type, IconButton, ActionRow, SheetSurface, tokens} from '../../src/ui';

const options=[
  {kind:'link',title:'Paste a link',subtitle:'Articles, posts & web links',route:'/(account)/new-link'},
  {kind:'note',title:'Write a note',subtitle:'Keep a thought or idea',route:'/(account)/new'},
  {kind:'image',title:'Photo or screenshot',subtitle:'Choose an image or take a photo',route:'/(account)/capture'},
  {kind:'pdf',title:'PDF document',subtitle:'Choose a PDF from your device',route:'/(account)/capture'},
] as const;

/** One modal window for both Library entry points; the Library never resizes underneath it. */
export default function SaveSomething() {
  const p=useBrandTheme();
  const {height,width}=useWindowDimensions();
  const insets=useSafeAreaInsets();
  const [visible,setVisible]=useState(true);const [reduced,setReduced]=useState(true);
  const closing=useRef(false);const sheetHeight=useRef(height);const offset=useRef(new Animated.Value(0)).current;
  const reduce=useRef(reduced);reduce.current=reduced;
  useEffect(() => {
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);});
    const event=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
    return()=>{alive=false;event.remove();offset.stopAnimation();};
  },[offset]);
  function close(next?:()=>void) {
    if(closing.current)return;closing.current=true;
    const done=()=>{setVisible(false);requestAnimationFrame(()=>{
      if(next)next();else if(router.canGoBack())router.back();else router.replace('/(account)');
    });};
    if(reduce.current){done();return;}
    Animated.timing(offset,{toValue:sheetHeight.current,duration:180,useNativeDriver:true}).start(({finished})=>{if(finished)done();});
  }
  const closeRef=useRef(close);closeRef.current=close;
  const pan=useRef(PanResponder.create({
    onMoveShouldSetPanResponder:(_,g)=>!closing.current&&g.dy>8&&Math.abs(g.dy)>Math.abs(g.dx)*1.3,
    onPanResponderMove:(_,g)=>{if(!closing.current)offset.setValue(Math.max(0,g.dy));},
    onPanResponderRelease:(_,g)=>{
      if(g.dy>80||g.vy>0.8)closeRef.current();
      else if(reduce.current)offset.setValue(0);
      else Animated.spring(offset,{toValue:0,useNativeDriver:true,speed:24,bounciness:0}).start();
    },
    onPanResponderTerminate:()=>offset.setValue(0),
  })).current;
  const choose=(item:typeof options[number])=>close(()=>{
    if(item.kind==='image'||item.kind==='pdf')router.replace({pathname:'/(account)/capture',params:{method:item.kind,pick:'1'}});
    else router.replace(item.route);
  });
  return <Modal visible={visible} transparent animationType="none" statusBarTranslucent
    navigationBarTranslucent onRequestClose={()=>close()}>
    <View style={[styles.root,{backgroundColor:p.scrim}]}>
      <Pressable accessible={false} importantForAccessibility="no" onPress={()=>close()}
        style={StyleSheet.absoluteFill}/>
      <SheetSurface animated accessibilityViewIsModal onLayout={e=>{sheetHeight.current=e.nativeEvent.layout.height;}}
        style={{maxHeight:height-insets.top-tokens.space.small,transform:[{translateY:offset}]}}>
        <SafeAreaView edges={['left','right','bottom']} style={{flexShrink:1}}>
          <View {...pan.panHandlers} style={styles.header}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={[styles.handle,{backgroundColor:p.secondaryText}]}/>
            <View style={styles.headingRow}>
              <Type variant={width<360?'editorHeading':'sheetHeading'} style={{flex:1}}>Save something</Type>
              <IconButton label="Close save options" icon="close" onPress={()=>close()}/>
            </View>
            <Type variant="intro" muted>Choose what to save.</Type>
          </View>
          <ScrollView style={{flexGrow:0,flexShrink:1}} contentContainerStyle={styles.options}
            showsVerticalScrollIndicator={false}>
            {options.map(item=><ActionRow key={item.kind} title={item.title} subtitle={item.subtitle}
              icon={item.kind} onPress={()=>choose(item)}/>)}
          </ScrollView>
        </SafeAreaView>
      </SheetSurface>
    </View>
  </Modal>;
}
const styles=StyleSheet.create({
  root:{flex:1,justifyContent:'flex-end'},
  header:{paddingHorizontal:tokens.geometry.screenPadding,paddingTop:tokens.space.medium,paddingBottom:tokens.space.regular},
  handle:{width:tokens.geometry.sheetHandleWidth,height:tokens.geometry.sheetHandleHeight,borderRadius:tokens.radii.tiny,
    alignSelf:'center',opacity:0.55,marginBottom:tokens.space.regular},
  headingRow:{flexDirection:'row',alignItems:'center',gap:tokens.space.tiny},
  options:{paddingHorizontal:tokens.geometry.screenPadding,paddingBottom:tokens.space.large},
});
