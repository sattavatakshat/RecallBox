import {useState} from 'react';
import {StatusBar} from 'expo-status-bar';
import {Image, type ImageURISource, Modal, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture} from 'react-native-gesture-handler';
import Animated, {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {Button, IconButton, tokens, usePalette} from './ui';

function clamp(value: number, bound: number) {
  'worklet';
  return Math.max(-bound, Math.min(bound, value));
}

/** Mounted only while open: every image/open/viewport gets an independent transform. */
function ZoomImage({source, label, width, height, ratio, onError}: {
  source: ImageURISource; label: string; width: number; height: number; ratio: number; onError: () => void;
}) {
  const p = usePalette();
  const fittedWidth = Math.min(width, height * ratio);
  const fittedHeight = fittedWidth / ratio;
  const scale = useSharedValue(1), x = useSharedValue(0), y = useSharedValue(0);
  const startScale = useSharedValue(1), startX = useSharedValue(0), startY = useSharedValue(0);
  const focalX = useSharedValue(0), focalY = useSharedValue(0);
  const pinching = useSharedValue(false);
  const pinch = usePinchGesture({
    onActivate: event => {
      pinching.value = true;
      startScale.value = scale.value; startX.value = x.value; startY.value = y.value;
      focalX.value = event.focalX - width / 2; focalY.value = event.focalY - height / 2;
    },
    onUpdate: event => {
      const next = Math.max(1, Math.min(6, startScale.value * event.scale));
      const factor = next / startScale.value;
      x.value = clamp(event.focalX - width / 2 - (focalX.value - startX.value) * factor,
        Math.max(0, (fittedWidth * next - width) / 2));
      y.value = clamp(event.focalY - height / 2 - (focalY.value - startY.value) * factor,
        Math.max(0, (fittedHeight * next - height) / 2));
      scale.value = next;
    },
    onFinalize: () => {pinching.value = false;},
  });
  const pan = usePanGesture({
    maxPointers: 1,
    onUpdate: event => {
      if (pinching.value || scale.value <= 1) return;
      x.value = clamp(x.value + event.changeX, Math.max(0, (fittedWidth * scale.value - width) / 2));
      y.value = clamp(y.value + event.changeY, Math.max(0, (fittedHeight * scale.value - height) / 2));
    },
  });
  const doubleTap = useTapGesture({numberOfTaps: 2, onDeactivate: event => {
    if (event.canceled) return;
    const next = scale.value > 1 ? 1 : 3;
    x.value = clamp((width / 2 - event.x) * (next - 1), Math.max(0, (fittedWidth * next - width) / 2));
    y.value = clamp((height / 2 - event.y) * (next - 1), Math.max(0, (fittedHeight * next - height) / 2));
    scale.value = next;
  }});
  const gesture = useSimultaneousGestures(pinch, pan, doubleTap);
  const transform = useAnimatedStyle(() => ({transform: [{translateX: x.value}, {translateY: y.value}, {scale: scale.value}]}));
  return <>
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={{width, height, overflow:'hidden', alignItems:'center', justifyContent:'center'}}>
        <Animated.View style={[{width:fittedWidth, height:fittedHeight}, transform]}>
          <Image source={source} accessibilityLabel={label} resizeMode="contain" resizeMethod="resize"
            style={{width:'100%', height:'100%'}} onError={onError}/>
        </Animated.View>
      </View>
    </GestureDetector>
    <Button variant="quiet" label="Reset zoom" onPress={() => {scale.value = 1; x.value = 0; y.value = 0;}}
      style={{position:'absolute', bottom:tokens.space.small, alignSelf:'center', backgroundColor:p.mediaBackground}} labelStyle={{color:p.mediaForeground}}/>
  </>;
}

export function ImageViewer({source, label, ratio, reducedMotion, onClose, onError}: {
  source: ImageURISource; label: string; ratio: number; reducedMotion: boolean; onClose: () => void; onError: () => void;
}) {
  const p = usePalette();
  const [viewport, setViewport] = useState({width:0, height:0});
  return <Modal visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}
    supportedOrientations={['portrait','landscape']}>
    <GestureHandlerRootView style={{flex:1, backgroundColor:p.mediaBackground}}>
      <StatusBar style="light"/>
      <SafeAreaView style={{flex:1}} accessibilityViewIsModal>
        <View style={{alignItems:'flex-end', paddingHorizontal:tokens.space.small}}>
          <IconButton icon="close" label="Close full-screen image" color={p.mediaForeground} onPress={onClose}/>
        </View>
        <View style={{flex:1}} onLayout={event => setViewport(event.nativeEvent.layout)}>
          {viewport.width > 0 && viewport.height > 0 && <ZoomImage key={`${viewport.width}:${viewport.height}`}
            source={source} label={label} ratio={ratio} {...viewport} onError={onError}/>}
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  </Modal>;
}
