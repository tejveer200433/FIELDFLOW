import Link from "next/link";
import { ArrowLeft, CheckCircle2, Globe2, Shield, XCircle } from "lucide-react";

export const metadata = {
  title: "Website Activity Privacy | FieldFlow",
  description: "Privacy information for the FieldFlow Website Activity browser extension."
};

const collected = [
  "The hostname (domain) of the active website, such as salesforce.com",
  "The browser name",
  "Time attributed to that domain during an active tracking session"
];

const excluded = [
  "Full URLs, URL paths, and search or query text",
  "Page titles, page content, form values, and passwords",
  "Typed characters, clipboard content, and screenshots",
  "Private or incognito browsing"
];

export default function WebsiteActivityPrivacyPage() {
  return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
      <header className="bg-slate-950 px-6 py-10 text-white sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-200 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to FieldFlow
        </Link>
        <div className="mt-8 flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600"><Shield className="h-6 w-6" /></span>
          <span className="text-sm font-bold uppercase tracking-[0.18em] text-blue-200">FieldFlow</span>
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">Website Activity Privacy Notice</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">How the FieldFlow Website Activity browser extension handles domain-only usage information.</p>
        <p className="mt-5 text-sm text-slate-400">Last updated: August 3, 2026</p>
      </header>

      <div className="space-y-10 px-6 py-10 sm:px-10">
        <section>
          <h2 className="text-xl font-bold text-slate-950">Purpose and collection control</h2>
          <p className="mt-3 leading-7 text-slate-600">The extension supports workforce activity reporting during an employee-started FieldFlow tracking session. It samples only while the FieldFlow desktop agent confirms that tracking is active. Employees can stop this collection by stopping tracking in the desktop agent.</p>
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
            <h2 className="flex items-center gap-2 font-bold text-emerald-900"><CheckCircle2 className="h-5 w-5" />Information collected</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-emerald-950">{collected.map(item => <li key={item}>• {item}</li>)}</ul>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
            <h2 className="flex items-center gap-2 font-bold text-rose-900"><XCircle className="h-5 w-5" />Information not collected</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-rose-950">{excluded.map(item => <li key={item}>• {item}</li>)}</ul>
          </div>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><Globe2 className="h-5 w-5 text-blue-600" />How information is transferred</h2>
          <p className="mt-3 leading-7 text-slate-600">The extension extracts the hostname from the active tab and discards the rest of the URL. It sends the hostname, browser name, and attributed time only to the FieldFlow desktop agent on the same computer at <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm text-slate-800">127.0.0.1</code>. The authenticated desktop agent queues and uploads that information to the employee’s organisation in FieldFlow.</p>
          <p className="mt-3 leading-7 text-slate-600">The extension does not contain or store FieldFlow passwords, authentication tokens, or database credentials. It stores only its latest connection and sampling status locally so the employee can see whether it is working.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">Use, sharing, and sale</h2>
          <p className="mt-3 leading-7 text-slate-600">The information is used only for the extension’s workforce activity-reporting purpose. It is not sold, used for advertising, or used for credit or lending decisions. Access is limited by the organisation’s FieldFlow permissions.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-slate-950">Retention and employee requests</h2>
          <p className="mt-3 leading-7 text-slate-600">The employee’s organisation controls server-side retention according to its monitoring policy. To request access, correction, or deletion of server-side activity information, contact your employer or organisation’s FieldFlow administrator.</p>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
          <h2 className="font-bold text-blue-950">Questions or support</h2>
          <p className="mt-2 text-sm leading-6 text-blue-900">Employees should contact their employer or FieldFlow administrator. The extension’s official store listing also provides the publisher’s verified support contact.</p>
        </section>
      </div>
    </article>
  </main>;
}
