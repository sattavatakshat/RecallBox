import React from 'react';
import {View} from 'react-native';

type Point = [number,number];
function Line({a,b,color}: {a: Point; b: Point; color: string}) {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  return <View style={{position:'absolute',left:(a[0]+b[0]-length)/2,
    top:(a[1]+b[1])/2-1,width:length,height:2.2,borderRadius:2,backgroundColor:color,
    transform:[{rotate:`${Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI}deg`}]}}/>;
}
export function CaptureIcon({kind,color}: {kind: 'link'|'note'|'image'|'pdf'|'close'|'chevron'; color: string}) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width:32,height:34}}>
    {kind==='close' ? <><Line a={[6,6]} b={[26,27]} color={color}/><Line a={[6,27]} b={[26,6]} color={color}/></> :
      kind==='chevron' ? <><Line a={[12,8]} b={[21,17]} color={color}/><Line a={[21,17]} b={[12,26]} color={color}/></> :
      kind==='link' ? <>
        <View style={{position:'absolute',left:3,top:13,width:13,height:21,borderWidth:2.2,borderColor:color,borderRadius:8,transform:[{rotate:'43deg'}]}}/>
        <View style={{position:'absolute',left:16,top:0,width:13,height:21,borderWidth:2.2,borderColor:color,borderRadius:8,transform:[{rotate:'43deg'}]}}/>
        <Line a={[11,23]} b={[23,10]} color={color}/>
      </> : kind==='image' ? <>
        <View style={{position:'absolute',left:2,top:5,width:28,height:24,borderWidth:2.2,borderRadius:3,borderColor:color}}/>
        <View style={{position:'absolute',left:8,top:10,width:5,height:5,borderRadius:3,borderWidth:2,borderColor:color}}/>
        <Line a={[4,26]} b={[14,17]} color={color}/><Line a={[14,17]} b={[20,23]} color={color}/>
        <Line a={[20,23]} b={[24,19]} color={color}/><Line a={[24,19]} b={[29,24]} color={color}/>
      </> : <>
        <View style={{position:'absolute',left:5,top:2,width:23,height:30,borderWidth:2.2,borderRadius:2,borderColor:color}}/>
        {kind==='pdf' && <><Line a={[19,3]} b={[19,11]} color={color}/><Line a={[19,11]} b={[27,11]} color={color}/><Line a={[19,3]} b={[27,11]} color={color}/></>}
        <Line a={[10,kind==='pdf'?17:10]} b={[23,kind==='pdf'?17:10]} color={color}/>
        <Line a={[10,kind==='pdf'?22:16]} b={[23,kind==='pdf'?22:16]} color={color}/>
        <Line a={[10,kind==='pdf'?27:22]} b={[18,kind==='pdf'?27:22]} color={color}/>
      </>}
  </View>;
}
