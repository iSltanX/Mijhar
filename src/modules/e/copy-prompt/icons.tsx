// أيقونات الزر (16×16، خط بلون النص) التي ليست في shared/ui/icons: النسخ والسهم والتحميل والفشل. زخرفية دائمًا (aria-hidden): المعنى في النص المجاور.
type Local = 'copy' | 'chevron-down' | 'spinner' | 'x-circle';

const D: Readonly<Record<Local, readonly string[]>> = {
  copy: ['M5.5 5.5H12.5V12.5H5.5V5.5Z', 'M3.5 10.5V3.5H10.5'],
  'chevron-down': ['M4 6L8 10L12 6'],
  spinner: ['M8 2.25A5.75 5.75 0 1 1 2.25 8'],
  'x-circle': ['M8 13.75C11.1756 13.75 13.75 11.1756 13.75 8C13.75 4.82436 11.1756 2.25 8 2.25C4.82436 2.25 2.25 4.82436 2.25 8C2.25 11.1756 4.82436 13.75 8 13.75Z', 'M6 6L10 10M10 6L6 10'],
};

export function LocalIcon({ name, size = 16, className }: { name: Local; size?: number; className?: string }) {
  return (
    <svg class={className ? `icon ${className}` : 'icon'} width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false" data-icon={name}>
      {D[name].map((d) => (
        <path key={d} d={d} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      ))}
    </svg>
  );
}
