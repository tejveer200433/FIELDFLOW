"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./TeamMapCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-[480px] place-items-center bg-slate-50 text-sm text-slate-500">Loading map…</div>
});

export default function LiveTeamMap() { return <Map />; }
