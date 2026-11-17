import {Icon} from './icons';
/** Compatibility adapter for existing content/search consumers. */
export function LibraryIcon({kind, color}: {kind: 'search'|'note'|'link'|'image'|'pdf'; color: string}) {
  return <Icon name={kind} color={color}/>;
}
