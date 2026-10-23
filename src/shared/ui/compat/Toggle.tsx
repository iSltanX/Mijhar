/** @jsxImportSource react */
// منقول من ghsim-source/src/components/common/Toggle.tsx (React 19) ويعمل عبر preact/compat (DEC-01 أ):
// الملف يُترجم إلى react/jsx-runtime فيصل إلى preact/compat/jsx-runtime (vite.config.ts). التغيير الوحيد عن الأصل
// e.currentTarget بدل e.target لأن أنواع Preact لا تضيّق target؛ والسلوك واحد. الأنماط في tokens.ts (.toggle-switch).
export function Toggle({ checked, onChange, label, id, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; id?: string; disabled?: boolean }) {
  return (
    <span className="toggle-switch">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
        aria-label={label}
        role="switch"
        aria-checked={checked}
      />
      <span className="toggle-slider" aria-hidden="true" />
    </span>
  )
}
