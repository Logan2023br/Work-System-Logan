export function DeskSkeleton() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Đang tải bàn điều phối">
      <div className="sk sk--title" />
      <div className="sk sk--line" />
      <div className="desk" style={{ marginTop: 34 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk sk--card" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    </div>
  )
}
