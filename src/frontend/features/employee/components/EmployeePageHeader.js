export default function EmployeePageHeader({ title, description, action, eyebrow = "My workspace" }) {
  return <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-violet-600">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.035em] text-slate-950 sm:text-3xl">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </header>;
}
