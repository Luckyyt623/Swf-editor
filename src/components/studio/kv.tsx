export function Kv({ items }: { items: { k: string; v: string }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {items.map((it) => (
        <div key={it.k} className="contents">
          <dt className="text-muted">{it.k}</dt>
          <dd className="font-mono text-xs tabular-nums break-all">{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}
