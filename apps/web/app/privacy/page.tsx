import type { Metadata } from 'next';
import Link from 'next/link';
import { contactEmail, lastUpdated } from '@/lib/legal';
export const metadata: Metadata = { title: 'Privacy Policy — Ctrue', description: 'What Ctrue collects, what it sends to AI providers, and what it never stores.' };
export default function Privacy() {
  return <main id="main" className="wrap page legal">
    <div className="eyebrow">PRIVACY POLICY</div>
    <h1>Your context<br /><span className="lime">stays yours.</span></h1>
    <p className="fine">Last updated {lastUpdated}</p>
    <p className="lead">This policy explains what Ctrue collects, what it sends to other companies to do its job, and what it never keeps.</p>

    <h2>What we store</h2>
    <ul>
      <li><strong>Your OpenAI API key is not one of them.</strong> It stays encrypted on your Mac and is sent with each request only so OpenAI can bill your own account. Our servers never save it.</li>
      <li><strong>Your account.</strong> You sign in with Google. We receive your name, email address and profile picture, and keep them with your account.</li>
      <li><strong>Your profile facts.</strong> Resume text you import or type and choose to save. You can edit or delete it at any time in the app or on your dashboard.</li>
      <li><strong>Usage records.</strong> When each session started and stopped and how long it ran.</li>
      <li><strong>Desktop sign-in.</strong> The desktop app holds its own sign-in tokens, encrypted by your operating system. Our servers keep only one-way hashes of them.</li>
    </ul>

    <h2>What we process but do not store</h2>
    <ul>
      <li><strong>Audio.</strong> While you are listening, your computer&rsquo;s audio (and your microphone, only if you turn it on) is streamed to our server and on to OpenAI to be transcribed.</li>
      <li><strong>Screenshots and questions.</strong> When you ask for an answer, your question, any screenshots you attach, recent transcript text and your saved profile facts are sent to OpenAI to generate it.</li>
      <li><strong>Transcripts and answers.</strong> These are shown in the app and held in its memory. They are cleared when you clear the session context or close the app.</li>
    </ul>
    <p>We do not save audio, screenshots, transcripts or answers on our servers. OpenAI processes what we send under its own terms and retention policies.</p>

    <h2>Other people on your calls</h2>
    <p>Audio you capture can include other people&rsquo;s voices. You are responsible for telling them and getting their consent wherever the law requires it. Many places require the consent of everyone on a call before it is recorded or transcribed.</p>

    <h2>Companies that help us run Ctrue</h2>
    <ul>
      <li><strong>Google</strong> for sign-in.</li>
      <li><strong>Neon</strong> for the database and account system.</li>
      <li><strong>OpenAI</strong> for transcription and answers, using your own OpenAI API key.</li>
      <li><strong>Hosting providers</strong> that run our website and servers.</li>
    </ul>
    <p>We do not sell your information, and we do not use advertising or analytics trackers.</p>

    <h2>Cookies</h2>
    <p>The website uses cookies only to keep you signed in.</p>

    <h2>How long we keep things</h2>
    <p>Account and profile data are kept until you delete them or ask us to delete your account. Usage records may be kept longer where legal rules require it.</p>

    <h2>Your choices</h2>
    <ul>
      <li>Delete your profile facts at any time from the app or your dashboard.</li>
      <li>Ask us for a copy of your data, or to delete your account, using the contact details below.</li>
    </ul>

    <h2>Security</h2>
    <p>Data is encrypted in transit, and access to our systems is restricted. No service can promise perfect security; tell us straight away if you believe your account has been misused.</p>

    <h2>Age</h2>
    <p>Ctrue is for people aged 18 or over.</p>

    <h2>Changes</h2>
    <p>If this policy changes in a way that matters, we will update the date above and tell you in the app or by email.</p>

    <h2>Contact</h2>
    <p>{contactEmail ? <>Questions or requests: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.</> : 'Contact details will be published here before launch.'} See also our <Link href="/terms">Terms of Service</Link>.</p>
  </main>;
}
