// A labelled form field.
export default function Field({ label, note, className, children }: { label: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block space-y-1 ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
      {note && <span className="block text-xs text-muted">{note}</span>}
    </label>
  );
}
