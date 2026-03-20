export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-zinc-200 rounded ${className || ''}`} />
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[#E8E8E8] bg-zinc-50">
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="py-3 px-6">
              <Skeleton className="h-4 w-24" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <tr key={rowIdx} className="border-b border-[#E8E8E8]">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <td key={colIdx} className="py-3 px-6">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-6 space-y-4">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-12 w-24" />
      <Skeleton className="h-4 w-48" />
    </div>
  )
}
