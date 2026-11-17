import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet,
  Text, View, useColorScheme, useWindowDimensions} from 'react-native';
import {SafeAreaView,useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {useBrandTheme,useBrandTypography} from '../../src/brand';
import {CaptureIcon} from '../../src/manual-save-icons';

const options=[
  {kind:'link',title:'Paste a link',subtitle:'Articles, posts & web links',route:'/(account)/new-link'},
  {kind:'note',title:'Write a note',subtitle:'Keep a thought or idea',route:'/(account)/new'},
  {kind:'image',title:'Photo or screenshot',subtitle:'Choose an image or take a photo',route:'/(account)/capture'},
  {kind:'pdf',title:'PDF document',subtitle:'Choose a PDF from your device',route:'/(account)/capture'},
] as const;

/** One modal window for both Library entry points; the Library never resizes underneath it. */
export default function SaveSomething() {
  const p=useBrandTheme();const {fontFamily}=useBrandTypography();
  const dark=useColorScheme()==='dark';const {height,width}=useWindowDimensions();
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
      <Animated.View accessibilityViewIsModal onLayout={e=>{sheetHeight.current=e.nativeEvent.layout.height;}}
        style={[styles.sheet,{maxHeight:height-insets.top-8,backgroundColor:dark?p.surface:p.background,
          borderColor:dark?'#43553F':p.line,transform:[{translateY:offset}]}]}>
        <SafeAreaView edges={['left','right','bottom']} style={{flexShrink:1}}>
          <View {...pan.panHandlers} style={styles.header}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={[styles.handle,{backgroundColor:p.secondaryText}]}/>
            <View style={styles.headingRow}>
              <Text accessibilityRole="header" style={{fontFamily,color:p.primaryText,
                fontSize:width<360?32:36,lineHeight:44,letterSpacing:-0.8,flex:1}}>Save something</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close save options"
                onPress={()=>close()} style={({pressed})=>({width:48,minHeight:48,
                  alignItems:'center',justifyContent:'center',opacity:pressed?0.6:1})}>
                <CaptureIcon kind="close" color={p.primaryText}/>
              </Pressable>
            </View>
            <Text style={{color:p.secondaryText,fontSize:18,lineHeight:26}}>Choose what to save.</Text>
          </View>
          <ScrollView style={{flexGrow:0,flexShrink:1}} contentContainerStyle={styles.options}
            showsVerticalScrollIndicator={false}>
            {options.map(item=><Pressable key={item.kind} accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.subtitle}`} onPress={()=>choose(item)}
              style={({pressed})=>[styles.row,{borderBottomColor:p.line,opacity:pressed?0.65:1}]}>
              <View style={[styles.icon,{backgroundColor:dark?'#3C5431':p.selectedSurface}]}>
                <CaptureIcon kind={item.kind} color={dark?p.accent:p.brand}/>
              </View>
              <View style={{flex:1,gap:3}}>
                <Text style={{color:p.primaryText,fontSize:19,lineHeight:26,fontWeight:'600',letterSpacing:-0.4}}>{item.title}</Text>
                <Text style={{color:p.secondaryText,fontSize:15,lineHeight:22,letterSpacing:-0.3}}>{item.subtitle}</Text>
              </View>
              <CaptureIcon kind="chevron" color={dark?p.accent:p.brand}/>
            </Pressable>)}
          </ScrollView>
        </SafeAreaView>
      </Animated.View>
    </View>
  </Modal>;
}
const styles=StyleSheet.create({
  root:{flex:1,justifyContent:'flex-end'},
  sheet:{width:'100%',maxWidth:540,alignSelf:'center',borderTopLeftRadius:34,borderTopRightRadius:34,
    borderWidth:1,overflow:'hidden',elevation:12},
  header:{paddingHorizontal:24,paddingTop:16,paddingBottom:18},
  handle:{width:48,height:5,borderRadius:4,alignSelf:'center',opacity:0.55,marginBottom:20},
  headingRow:{flexDirection:'row',alignItems:'center',gap:4},
  options:{paddingHorizontal:24,paddingBottom:22},
  row:{minHeight:88,flexDirection:'row',alignItems:'center',gap:16,paddingVertical:12,borderBottomWidth:1},
  icon:{width:58,height:58,borderRadius:17,alignItems:'center',justifyContent:'center'},
});
