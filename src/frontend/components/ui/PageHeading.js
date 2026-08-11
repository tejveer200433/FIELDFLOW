export default function PageHeading({ title, subtitle, action }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-1 text-base text-slate-500">{subtitle}</p>
    </div>
    {action}
  </div>;
}
