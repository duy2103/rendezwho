import { SvgXml } from 'react-native-svg';
import { logo, logoCompact } from '../theme/svg-assets';
export default function LogoMark({ compact = false }: { compact?: boolean }) {
  return <SvgXml xml={compact ? logoCompact : logo} />;
}
