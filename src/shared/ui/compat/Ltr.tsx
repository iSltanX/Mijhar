/** @jsxImportSource react */
// منقول من ghsim-source/src/components/common/Ltr.tsx كما هو، عبر preact/compat (DEC-01 أ).
import type { CSSProperties, ReactNode } from 'react'

/** يعزل أسماء المستخدمين والفروع والأكواد والأوامر عن انعكاس اتجاه RTL. */
export function Ltr({
  children,
  className,
  mono,
  style,
}: {
  children: ReactNode
  className?: string
  mono?: boolean
  style?: CSSProperties
}) {
  return (
    <span className={`ltr-inline ${mono ? 'mono' : ''} ${className ?? ''}`} style={style}>
      {children}
    </span>
  )
}
