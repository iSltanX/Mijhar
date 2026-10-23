// واجهات الوحدة (ح) في تبويب «المجتمع وأول مساهمة» من اللوحة الأصلية والدرج. الترتيب هو ترتيب ظهورها في التبويب.
import type { PanelView } from '../../sidepanel/views';
import { NativeOnlyNotice } from '../../shared/ui/NativeOnlyNotice';
import { DiscoveryView } from './discovery/DiscoveryView';
import { GuideView } from './first-contribution/GuideView';
import { ReadmePanelView } from './readme-detector/ReadmePanelView';
import { ResourcesView } from './resources/ResourcesView';

// الدرج المحقون لا يعرض حقول كتابة (DEC-04): واجهتا الاكتشاف والموارد (فيهما حقول) للوحة الأصلية، وفي الدرج رسالة تدل عليهما؛
// أما README العربي والمرشد فأزرار وروابط بلا حقول فتظهران في الاثنين.
const DiscoveryDrawerNotice = () => <NativeOnlyNotice feature="اكتشاف المحتوى العربي" />;
const ResourcesDrawerNotice = () => <NativeOnlyNotice feature="موارد تعلّم عربية" />;

export const COMMUNITY_PANEL_VIEWS: readonly PanelView[] = [
  { id: 'h-readme', tab: 'community', unit: 'h', title: 'README العربي', component: ReadmePanelView },
  { id: 'h-guide', tab: 'community', unit: 'h', title: 'مرشد أول مساهمة', component: GuideView },
  { id: 'h-discovery', tab: 'community', unit: 'h', title: 'اكتشاف المحتوى العربي', surfaces: ['native'], component: DiscoveryView },
  { id: 'h-discovery-drawer', tab: 'community', unit: 'h', title: 'اكتشاف المحتوى العربي', surfaces: ['drawer'], component: DiscoveryDrawerNotice },
  { id: 'h-resources', tab: 'community', unit: 'h', title: 'موارد تعلّم عربية', surfaces: ['native'], component: ResourcesView },
  { id: 'h-resources-drawer', tab: 'community', unit: 'h', title: 'موارد تعلّم عربية', surfaces: ['drawer'], component: ResourcesDrawerNotice },
];
