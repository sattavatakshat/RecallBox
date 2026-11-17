import {Icon} from './icons';
import {tokens} from './theme';
/** Existing callers keep their contract; no independent icon renderer remains. */
export function CaptureIcon({kind, color}: {kind: 'link'|'note'|'image'|'pdf'|'close'|'chevron'; color: string}) {
  return <Icon name={kind} color={color} size={tokens.geometry.iconLarge}/>;
}
