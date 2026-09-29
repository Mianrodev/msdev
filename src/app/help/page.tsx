import Link from "next/link";
import { LISTS } from "@/components/plain";
import { PageHeader } from "@/components/ui";

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" intro="Everything you need to know, in plain words." />

      <section className="card">
        <h2>Your weekly routine (5 minutes)</h2>
        <ol>
          <li>
            <strong>Add new leads</strong> as you find them (<Link href="/records/new">Add a lead</Link>), or upload an updated
            spreadsheet on the <Link href="/import">Upload</Link> page.
          </li>
          <li>
            On the <Link href="/">Home</Link> page, press <strong>Run weekly check</strong>. It sorts new leads and re-checks
            the ones you already have.
          </li>
          <li>
            Open your <Link href="/records?list=ready">Ready</Link> list. For each lead: read the prepared brief and answers,
            open the listing, apply <em>yourself</em>, then press <strong>I&apos;ve applied</strong>.
          </li>
          <li>
            Glance at <Link href="/records?list=hold">On hold</Link>. Each one says what information is missing. When you
            have it, update the lead and press <strong>Put it back</strong>.
          </li>
        </ol>
      </section>

      <h2>What the four lists mean</h2>
      <div className="tiles">
        {(["ready", "checking", "hold", "archive"] as const).map((l) => (
          <Link key={l} className={`tile ${l}`} href={`/records?list=${l}`}>
            <div className="t">{LISTS[l].title}</div>
            <div className="d">{LISTS[l].help}</div>
          </Link>
        ))}
      </div>

      <h2>Common questions</h2>
      <div className="grid cols-2">
        <div className="card">
          <h3>Does this app apply or send anything for me?</h3>
          <p>
            No, never. It only sorts, checks and keeps prepared material ready. You always apply and send messages yourself,
            then tell the app you did.
          </p>
        </div>
        <div className="card">
          <h3>Can I lose data?</h3>
          <p>
            No. Nothing is ever deleted — rejected leads go to Archived, and you can put them back. Every change is recorded
            on the <Link href="/history">Activity</Link> page.
          </p>
        </div>
        <div className="card">
          <h3>What does the weekly check actually do?</h3>
          <p>
            It checks every lead against your <Link href="/settings">Rules</Link>. A lead that clearly fails a rule is
            archived; one that needs a closer look goes on hold; one that passes every step becomes Ready. It also re-checks
            leads that were Ready before — being Ready once isn&apos;t permanent.
          </p>
        </div>
        <div className="card">
          <h3>Why did a lead go on hold instead of Ready?</h3>
          <p>
            Usually because nobody has confirmed the listing is still open. Open the lead, check the link, set &quot;Is the
            link still open?&quot; to &quot;Checked — still open&quot;, then press Put it back.
          </p>
        </div>
        <div className="card">
          <h3>What if I don&apos;t know something?</h3>
          <p>
            Leave it empty or type &quot;unknown&quot;. Never guess. An unknown detail never counts against a lead — only a
            real mismatch does.
          </p>
        </div>
        <div className="card">
          <h3>How do I share my list safely?</h3>
          <p>
            On the Leads page, open &quot;Download this list&quot; and choose <strong>Download shared copy</strong>. It removes
            the personal details you listed on the <Link href="/privacy">Privacy</Link> page, prepared briefs and answers,
            notes, and all contact details.
          </p>
        </div>
        <div className="card">
          <h3>I added the same lead twice — is that a problem?</h3>
          <p>
            No. If the company, opportunity and link match, the app updates the existing lead instead of making a copy.
          </p>
        </div>
        <div className="card">
          <h3>How do I change my password?</h3>
          <p>
            Go to <Link href="/settings">Rules</Link> and scroll to &quot;Your password&quot;.
          </p>
        </div>
      </div>

      <h2>Words you might see</h2>
      <dl className="kv card">
        <dt>Lead</dt>
        <dd>Anything you&apos;re tracking: an opening at a company.</dd>
        <dt>Company</dt>
        <dd>An organisation worth approaching, even without a specific opening.</dd>
        <dt>Prepared brief / answers</dt>
        <dd>The cover letter and application answers written for a lead, ready for you to copy.</dd>
        <dt>Fit rating</dt>
        <dd>How good a match a Ready lead is: Exceptional, Strong, Good or Stretch.</dd>
        <dt>Steps 1–4</dt>
        <dd>New → first look → deeper look → final check. After the final check, a lead is Ready.</dd>
      </dl>
    </>
  );
}
