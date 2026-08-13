export default function WorkspaceLoadingShell({ employee = false }) {
  return <div aria-label="Loading FieldFlow workspace" className={`min-h-screen lg:flex lg:p-2 ${employee ? "bg-[#f0f3f8]" : "bg-[#edf3f9]"}`}>
    <aside className={`hidden w-[226px] shrink-0 rounded-l-2xl p-5 lg:block ${employee ? "border-r border-slate-200 bg-white" : "bg-[#06172d]"}`}>
      <div className="flex items-center gap-3"><span className={`h-10 w-10 animate-pulse rounded-xl ${employee ? "bg-violet-100" : "bg-blue-600/70"}`} /><span className={`h-4 w-28 animate-pulse rounded ${employee ? "bg-slate-200" : "bg-white/15"}`} /></div>
      <div className="mt-10 space-y-4">{Array.from({ length: 7 }, (_, index) => <div key={index} className={`h-10 animate-pulse rounded-xl ${employee ? "bg-slate-100" : "bg-white/[0.07]"}`} />)}</div>
    </aside>
    <div className="min-w-0 flex-1 overflow-hidden bg-white lg:rounded-r-2xl">
      <header className="flex h-[68px] items-center border-b border-slate-100 px-6"><div className="ml-auto h-10 w-full max-w-sm animate-pulse rounded-xl bg-slate-100" /><div className="ml-3 h-10 w-10 animate-pulse rounded-full bg-slate-100" /></header>
      <main className="p-5 sm:p-8"><div className="h-7 w-52 animate-pulse rounded bg-slate-200" /><div className="mt-3 h-4 w-36 animate-pulse rounded bg-slate-100" /><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" />)}</div><div className="mt-5 h-80 animate-pulse rounded-2xl border border-slate-100 bg-slate-50" /></main>
    </div>
  </div>;
}
