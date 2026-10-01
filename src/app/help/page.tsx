import Link from "next/link";
import { LISTS } from "@/components/plain";
import { PageHeader } from "@/components/ui";

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" intro="Everything you need to know, in plain words." />

      <section className="card">
        <h2>Your weekly routine (10 minutes)</h2>
        <ol>
          <li>
            <strong>Every Monday the app searches for you.</strong> It reads the job boards of every company you&apos;re
            tracking, adds new jobs that match your words and rules, and checks whether your leads&apos; listings are still
            open. (You can also press <strong>Find new leads</strong> on the <Link href="/">Home</Link> page any time.)
          </li>
          <li>
            Open <Link href="/records?list=review">New to review</Link>. For each job, read about it and press{" "}
            <strong>Yes</strong>, <strong>Not sure</strong> or <strong>No</strong>. The next one opens automatically.
          </li>
          <li>
            Open your <Link href="/records?list=ready">Ready</Link> list. For each lead: open the listing, apply{" "}
            <em>yourself</em> (copy your usual answers from <Link href="/answers">My answers</Link> — they show on every
            Ready lead), then set <strong>Your application</strong> to &quot;Applied&quot;. As you hear back, change it
            (Heard back, Interviewing, Offer…) on your <Link href="/records?list=applied">Applied</Link> list.
          </li>
          <li>
            Found something elsewhere? <Link href="/records/new">Add it by hand</Link>. Want the app to watch a new company?
            Paste its careers link on <Link href="/discover">Find leads</Link>.
          </li>
        </ol>
      </section>

      <h2>What the lists mean</h2>
      <div className="tiles">
        {(["review", "ready", "applied", "checking", "hold", "archive"] as const).map((l) => (
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
          <h3>What does the weekly search actually do?</h3>
          <p>
            It searches for new jobs, checks whether listings are still open, and checks every lead against your{" "}
            <Link href="/settings#rules">rules</Link> (under Settings). A lead that clearly fails a rule (or whose listing has closed) is archived;
            one that needs a closer look goes on hold; new jobs wait for your Yes / No. Being Ready once isn&apos;t
            permanent — Ready leads are re-checked every week.
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
          <h3>Where do new jobs come from — and are they genuine?</h3>
          <p>
            From companies&apos; own careers pages (Lever, Greenhouse, Ashby, Workable, Recruitee, SmartRecruiters): the
            companies in your tracker, ones you add on <Link href="/discover">Find leads</Link>, and new companies spotted on
            remote-job sites (Remotive, Himalayas, Workable job search, Jobicy, RemoteOK, Working Nomads, We Work Remotely). A job from a
            remote-job site is only added once the same job is found on the company&apos;s own careers page — so every job
            the app adds was posted by the company itself. Each job says how it was confirmed under &quot;Is it
            genuine?&quot;. It costs nothing and uses no AI. LinkedIn and similar sites can&apos;t be searched automatically —
            add those by hand.
          </p>
        </div>
        <div className="card">
          <h3>How do I spot a fake job?</h3>
          <p>
            Real companies never ask you to pay (for training, equipment or &quot;registration&quot;), never move the
            conversation to WhatsApp or Telegram, and always interview you. The app drops listings showing these signs, but
            stay careful with anything you add by hand: check the job is on the company&apos;s own website.
          </p>
        </div>
        <div className="card">
          <h3>Why was a job I expected not added?</h3>
          <p>
            Its title didn&apos;t contain one of your words, contained a skip word, or it failed a rule (on-site, or only for
            another region). Adjust the words on <Link href="/discover">Find leads</Link>.
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
          <h3>I applied somewhere — how do I track it?</h3>
          <p>
            Every lead has a <strong>Your application</strong> drop-down (on its page, and in the last column of every list).
            Pick &quot;Applied&quot; and it moves to your <Link href="/records?list=applied">Applied</Link> list with
            today&apos;s date. Change it as things happen: Heard back, Interviewing, Offer, Not successful. Applied somewhere
            that isn&apos;t in the app yet? <Link href="/records/new">Add it by hand</Link> first.
          </p>
        </div>
        <div className="card">
          <h3>Can my own AI (Claude) help?</h3>
          <p>
            Yes. On <Link href="/connect">Your AI</Link>, make a private link and add it to Claude as a connector. Claude can
            then read your leads, write cover letters and answers onto them, add notes and add jobs it finds — using your own
            Claude plan. It can never apply, contact anyone, or decide for you.
          </p>
        </div>
        <div className="card">
          <h3>Can other people use it too?</h3>
          <p>
            Yes. The owner invites people on the <strong>Team</strong> page. Each person gets their own private space —
            their own leads, search words, rules, answers and privacy details — and signs in with their email and password.
            The owner can open anyone&apos;s space to help (a yellow bar shows whose space it is), and can switch an account
            off without losing its data.
          </p>
        </div>
        <div className="card">
          <h3>I forgot my password. What now?</h3>
          <p>
            On the sign-in page, press <strong>Forgot your password?</strong>, type your email (the owner can leave it empty)
            and your recovery code, and choose a new password. No recovery code? Team members can ask the owner for a
            password link. Make a code now on the <Link href="/account">Password</Link> page, so you&apos;re never locked
            out.
          </p>
        </div>
        <div className="card">
          <h3>How do I change my password?</h3>
          <p>
            Open <Link href="/settings">Settings</Link> → <Link href="/account">Password</Link>. That&apos;s also where you
            make your recovery code.
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
