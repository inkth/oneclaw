const skeleton = "skeleton rounded-xl";

export function AppLoading() {
  return (
    <div className="space-y-6" aria-label="页面加载中" aria-busy="true">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2.5">
          <div className={`${skeleton} h-7 w-40`} />
          <div className={`${skeleton} h-4 w-72 max-w-[78vw]`} />
        </div>
        <div className="flex gap-2">
          <div className={`${skeleton} h-9 w-24 rounded-full`} />
          <div className={`${skeleton} h-9 w-20 rounded-full`} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="dk-card space-y-4 p-5">
            <div className={`${skeleton} h-9 w-9`} />
            <div className={`${skeleton} h-6 w-2/3`} />
            <div className={`${skeleton} h-3 w-1/2`} />
          </div>
        ))}
      </div>

      <div className="dk-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--dk-stroke-divider)] px-5 py-4">
          <div className={`${skeleton} h-5 w-32`} />
          <div className={`${skeleton} h-8 w-20 rounded-full`} />
        </div>
        <div className="divide-y divide-[var(--dk-stroke-divider)]">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-5 py-4">
              <div className={`${skeleton} h-10 w-10 shrink-0`} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`${skeleton} h-4 w-2/3`} />
                <div className={`${skeleton} h-3 w-1/3`} />
              </div>
              <div className={`${skeleton} hidden h-4 w-16 sm:block`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
