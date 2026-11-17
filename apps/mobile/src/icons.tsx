
import {View, type StyleProp, type ViewStyle} from 'react-native';
import Library from 'lucide-react-native/icons/library';
import Search from 'lucide-react-native/icons/search';
import Layers from 'lucide-react-native/icons/layers';
import Plus from 'lucide-react-native/icons/plus';
import UserRound from 'lucide-react-native/icons/user-round';
import Link from 'lucide-react-native/icons/link';
import NotebookPen from 'lucide-react-native/icons/notebook-pen';
import Image from 'lucide-react-native/icons/image';
import FileText from 'lucide-react-native/icons/file-text';
import Star from 'lucide-react-native/icons/star';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import X from 'lucide-react-native/icons/x';
import MoreHorizontal from 'lucide-react-native/icons/more-horizontal';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Check from 'lucide-react-native/icons/check';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import RotateCcw from 'lucide-react-native/icons/rotate-ccw';
import Upload from 'lucide-react-native/icons/upload';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Square from 'lucide-react-native/icons/square';
import SquareCheck from 'lucide-react-native/icons/square-check';
import BookOpen from 'lucide-react-native/icons/book-open';
import Bell from 'lucide-react-native/icons/bell';
import Sun from 'lucide-react-native/icons/sun';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import CircleHelp from 'lucide-react-native/icons/circle-help';
import Clock from 'lucide-react-native/icons/clock';
import CloudUpload from 'lucide-react-native/icons/cloud-upload';
import {tokens, usePalette} from './theme';

const icons = {library: Library, search: Search, collections: Layers, save: Plus, account: UserRound,
  link: Link, note: NotebookPen, image: Image, pdf: FileText, star: Star, back: ArrowLeft,
  close: X, more: MoreHorizontal, filter: SlidersHorizontal, check: Check, warning: TriangleAlert,
  retry: RotateCcw, upload: Upload, chevron: ChevronRight, down: ChevronDown,
  square: Square, checked: SquareCheck, learning: BookOpen, notifications: Bell,
  appearance: Sun, privacy: ShieldCheck, help: CircleHelp, clock: Clock, sync: CloudUpload};
export type IconName = keyof typeof icons;
/** Decorative by default. Interactive parents supply a meaningful accessible label. */
export function Icon({name, size = tokens.geometry.icon, color, filled = false, label, style}: {
  name: IconName; size?: number; color?: string; filled?: boolean; label?: string; style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const Shape = icons[name];
  return <View accessible={Boolean(label)} accessibilityLabel={label} accessibilityRole={label ? 'image' : undefined}
    accessibilityElementsHidden={!label} importantForAccessibility={label ? 'yes' : 'no-hide-descendants'} style={style}>
    <Shape width={size} height={size} color={color ?? p.primaryText}
      strokeWidth={tokens.geometry.strokeWidth} fill={filled ? color ?? p.primaryText : 'none'}/>
  </View>;
}
export function sourceIcon(kind: string): IconName {
  return kind === 'url' || kind === 'link' ? 'link' : kind === 'image' ? 'image' : kind === 'pdf' ? 'pdf' : 'note';
}
