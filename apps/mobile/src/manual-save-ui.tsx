import React from 'react';
import {View, type TextInputProps} from 'react-native';
import {Button, IconButton, Input, Notice, Screen, Type, tokens} from './ui';

/** RB-04 contracts retained; form controls are the shared application controls. */
export function CaptureEditor({title, subtitle, onCancel, busy, children}: React.PropsWithChildren<{
  title: string; subtitle: string; onCancel: () => void; busy: boolean;
}>) {
  return <Screen contentWidth={tokens.geometry.editorWidth}>
    <View style={{flexDirection: 'row', alignItems: 'center', gap: tokens.space.compact}}>
      <Type variant="editorHeading" style={{flex: 1}}>{title}</Type>
      <IconButton label="Cancel capture" icon="close" onPress={onCancel} disabled={busy}/>
    </View>
    <Type muted>{subtitle}</Type>{children}
  </Screen>;
}
export function CaptureInput(props: TextInputProps & {label: string}) {return <Input {...props}/>;}
export function CaptureButton({quiet = false, ...props}: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; quiet?: boolean;
}) {return <Button {...props} variant={quiet ? 'quiet' : 'primary'}/>;}
export function CaptureMessage({children, error = false}: React.PropsWithChildren<{error?: boolean}>) {
  return <Notice kind={error ? 'error' : 'info'}>{children}</Notice>;
}
