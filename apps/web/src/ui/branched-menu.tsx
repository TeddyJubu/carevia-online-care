import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'

// React Bits "BranchedMenu" (JS-CSS, reactbits.dev/r/BranchedMenu-JS-CSS.json), ported for a booking form:
// heads and leaves are native radios (arrow keys, "2 of 7", form semantics) instead of buttons with aria-current,
// one section is open at a time (the chosen head), and the branch lines are measured so wrapped labels still line up.
// ponytail: the registry's Hugeicons dependency only fed its demo items, so it was dropped.

export type Branch<V> = { value: string; label: string; meta?: ReactNode; children: { value: V; label: string }[] }

const TRUNK = 22 // x of the branch's trunk, under the head's text
const INDENT = 44 // where the leaves start
const R = 10 // elbow radius

export function BranchedMenu<V extends string | number>({ sections, open, active, onOpen, onSelect, name, childName, labelledBy, className = '', ref }: {
  sections: Branch<V>[]
  open?: string
  active?: V
  onOpen: (index: number) => void
  onSelect: (value: V) => void
  name: string
  childName: string
  labelledBy: string
  className?: string
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div ref={ref} role="radiogroup" aria-labelledby={labelledBy} className={`bm ${className}`}>
      {sections.map((s, i) => {
        const isOpen = s.value === open
        return (
          <div key={s.value} className="bm-section" data-open={isOpen ? '' : undefined}>
            <label className="bm-head">
              <input type="radio" name={name} checked={isOpen} onChange={() => onOpen(i)} />
              <span className="bm-head-label">{s.label}</span>
              {s.meta && <span className="fine bm-meta">{s.meta}</span>}
              <svg className="bm-chev" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </label>
            {/* Closed bodies are visibility: hidden once folded, so their radios leave the tab order and the accessibility tree. */}
            <div className="bm-body">
              <div className="bm-fold">
                <Leaves label={s.label} items={s.children} active={isOpen ? active : undefined} name={childName} onSelect={onSelect} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Leaves<V extends string | number>({ label, items, active, name, onSelect }: { label: string; items: Branch<V>['children']; active?: V; name: string; onSelect: (value: V) => void }) {
  const tree = useRef<HTMLDivElement>(null)
  const [{ ys, h }, setGeo] = useState({ ys: [] as number[], h: 0 })
  // Row centres, re-measured whenever the tree resizes (labels wrap on phones).
  useLayoutEffect(() => {
    const el = tree.current
    if (!el) return
    const measure = () => setGeo({ ys: [...el.querySelectorAll<HTMLElement>('.bm-item')].map((r) => r.offsetTop + r.offsetHeight / 2), h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [items])

  const endX = INDENT - 6
  const reach = (y: number) => `M ${TRUNK} 0 V ${y - R} A ${R} ${R} 0 0 0 ${TRUNK + R} ${y} H ${endX}`
  const length = (y: number) => y - R + (Math.PI * R) / 2 + (endX - TRUNK - R)

  return (
    <div ref={tree} role="radiogroup" aria-label={`${label}: services`} className="bm-tree">
      {ys.length === items.length && (
        <svg className="bm-lines" width={INDENT} height={h} aria-hidden="true">
          <path className="bm-base" d={`M ${TRUNK} 0 V ${ys[ys.length - 1] - R}`} />
          {ys.map((y, k) => <path key={k} className="bm-base" d={`M ${TRUNK} ${y - R} A ${R} ${R} 0 0 0 ${TRUNK + R} ${y} H ${endX}`} />)}
          {ys.map((y, k) => <path key={k} className="bm-reach" d={reach(y)} style={{ strokeDasharray: length(y), strokeDashoffset: items[k].value === active ? 0 : length(y) }} />)}
        </svg>
      )}
      {items.map((it, k) => (
        <label key={it.value} className="bm-item" style={{ '--i': k } as CSSProperties}>
          <input type="radio" name={name} checked={it.value === active} onChange={() => onSelect(it.value)} />
          <span>{it.label}</span>
        </label>
      ))}
    </div>
  )
}
