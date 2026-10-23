// تنبيه الجهاز المشترك ومكان التخزين (AC-G4/AC-G5): يظهر دائمًا في واجهة الوحدة وفي الإعدادات، بنصه المعتمد.
import { useRef } from 'preact/hooks';
import { useStyles } from '../../../../shared/ui/useStyles';
import { SHARED_DEVICE_BODY, SHARED_DEVICE_TITLE, STORAGE_LOCATION_TEXT } from '../notice';
import { DATA_CSS, DATA_STYLE_ID } from './styles';

export function SharedDeviceNotice({ withLocation = true }: { withLocation?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useStyles(ref, DATA_STYLE_ID, DATA_CSS);
  return (
    <div ref={ref} class="data-notices" data-privacy-notices="">
      {withLocation && (
        <p class="muted small" data-storage-location="">
          <strong>مكان التخزين:</strong> {STORAGE_LOCATION_TEXT}
        </p>
      )}
      <div class="shared-notice" role="note" data-shared-device-warning="">
        <p>
          <strong>{SHARED_DEVICE_TITLE}</strong> {SHARED_DEVICE_BODY}
        </p>
      </div>
    </div>
  );
}
