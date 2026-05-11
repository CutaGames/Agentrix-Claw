/**
 * SkinCardSkeleton — 皮肤卡片骨架屏组件
 *
 * 在 API 请求期间显示，匹配 SkinCard 的布局尺寸，避免 CLS。
 *
 * Requirements: 3.2
 */

export function SkinCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-800 animate-pulse">
      {/* Thumbnail placeholder */}
      <div className="aspect-square w-full bg-gray-700" />

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Clan badge + Name */}
        <div className="flex items-start gap-2">
          <div className="h-4 w-12 rounded bg-gray-700" />
          <div className="h-4 flex-1 rounded bg-gray-700" />
        </div>

        {/* Creator */}
        <div className="h-3 w-24 rounded bg-gray-700" />

        {/* Stats row */}
        <div className="flex items-center gap-3">
          <div className="h-3 w-10 rounded bg-gray-700" />
          <div className="h-3 w-10 rounded bg-gray-700" />
          <div className="h-3 w-10 rounded bg-gray-700" />
        </div>

        {/* Price placeholder */}
        <div className="mt-auto h-8 w-full rounded-lg bg-gray-700" />
      </div>
    </div>
  );
}

export default SkinCardSkeleton;
