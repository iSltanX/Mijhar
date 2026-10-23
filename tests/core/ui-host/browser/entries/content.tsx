// سكربت المحتوى في الإضافة الاختبارية: سكربت المحتوى الحقيقي (startContent) بثماني وحدات وهمية أ–ح، وينشر جاهزيته
// وأخطاءه في سمات <html> ليقرأها المشغّل من عالم الصفحة (العالم المعزول لا يُرى منه).
import { startContent } from '../../../../../src/content/main';
import { fakeUnitModules } from '../../fake-modules';

const root = document.documentElement;
const { ready } = startContent({
  modules: fakeUnitModules(),
  lifecycle: {
    onError: (event) => root.setAttribute('data-mj-error', `${event.moduleId}:${event.phase}:${String(event.error)}`),
    onReconcile: (result) => root.setAttribute('data-mj-page', `${result.page.type}:${result.page.confidence}`),
  },
});
ready.then(
  ({ drawer }) => {
    root.setAttribute('data-mj-content', 'ready');
    // حالة الدرج في سمة: المضيف قد لا يُنشأ قبل أول فتح.
    const sync = () => root.setAttribute('data-mj-drawer', drawer.isOpen ? 'open' : 'closed');
    sync();
    new MutationObserver(sync).observe(root, { subtree: true, attributes: true, attributeFilter: ['data-open'] });
  },
  (error: unknown) => root.setAttribute('data-mj-error', `start:${String(error)}`),
);
