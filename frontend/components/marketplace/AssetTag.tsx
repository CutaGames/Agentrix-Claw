interface AssetTagProps {
  text: string
  color?: 'indigo' | 'blue' | 'green' | 'orange' | 'purple'
}

const colorMap = {
  indigo: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  blue: 'bg-blue-100 text-blue-700 border-blue-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  orange: 'bg-orange-100 text-orange-700 border-orange-200',
  purple: 'bg-purple-100 text-purple-700 border-purple-200',
}

export function AssetTag({ text, color = 'indigo' }: AssetTagProps) {
  return (
    <span className={`inline-flex items-center px-3 py-1 text-xs font-medium border rounded-full ${colorMap[color]} whitespace-nowrap`}>
      {text}
    </span>
  )
}

