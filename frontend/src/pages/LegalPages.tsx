import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME, LEGAL_UPDATED, SUPPORT_EMAIL } from '../lib/brand'

// Written to match what the code actually does (see supabase/migrations and backend/app/routes).
// Have them reviewed by someone qualified in POPIA before a public launch.

const contact = SUPPORT_EMAIL
  ? <a className="text-link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  : <>the contact details on the <Link className="text-link" to="/support">Help & support</Link> page</>

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2>{title}</h2>{children}</section>
}

export function PrivacyContent() {
  return <>
    <p className="muted">Last updated {LEGAL_UPDATED}</p>
    <p>{APP_NAME} helps South African students find bursaries and check whether they qualify and have the right documents. This notice explains what we do with your personal information under the Protection of Personal Information Act (POPIA).</p>
    <Section title="Who is responsible">
      <p>The {APP_NAME} team is the responsible party for your information. You can reach us, and our information officer, at {contact}.</p>
    </Section>
    <Section title="What we keep">
      <ul>
        <li><strong>Your account:</strong> email address and password. Passwords are stored by our sign-in provider only as a secure hash; we never see them.</li>
        <li><strong>Your profile:</strong> name, institution, course, field and year of study, and the year you need funding for.</li>
        <li><strong>Your applications:</strong> the answers you give in a readiness check (for example your household income and latest average), the result, and your notes.</li>
        <li><strong>Saved bursaries:</strong> the bursaries you bookmark.</li>
      </ul>
    </Section>
    <Section title="What we never keep">
      <ul>
        <li><strong>Your documents.</strong> Files stay on your device. When you run a document check, they are sent over an encrypted connection, scanned for malware, read in memory and then discarded. Nothing from them is saved.</li>
        <li><strong>Your ID number and home address</strong> typed into a document check are used for that check only.</li>
        <li>We don't use advertising, tracking cookies or analytics, and we never sell your information.</li>
      </ul>
    </Section>
    <Section title="Why we use it">
      <p>Only to provide the service you asked for: to show bursaries that fit you, run your checks and keep your applications so you can return to them. Our lawful basis is your consent and the need to provide this service. You can withdraw consent at any time by deleting your account.</p>
    </Section>
    <Section title="If you are under 18">
      <p>A parent or guardian must agree before you create an account, as POPIA requires for children's information.</p>
    </Section>
    <Section title="Who else sees it">
      <p>No one else can see your information. Database rules let each account read only its own records. Our hosting and sign-in provider (Supabase) stores it for us under a data processing agreement. Bursary listings come from public websites; any AI service we use to read those listings receives only the public page, never your information.</p>
    </Section>
    <Section title="How long we keep it">
      <p>Until you delete it. Deleting your account removes your profile, applications and saved bursaries straight away.</p>
    </Section>
    <Section title="Your rights">
      <ul>
        <li><strong>See your information:</strong> Profile → Download my data.</li>
        <li><strong>Correct it:</strong> Profile → Edit.</li>
        <li><strong>Delete it:</strong> Profile → Delete my account.</li>
        <li><strong>Object or complain:</strong> contact us at {contact}. You may also complain to the Information Regulator at <a className="text-link" href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer">inforegulator.org.za</a>.</li>
      </ul>
    </Section>
    <Section title="How we protect it">
      <p>Encrypted connections, per-account database rules, malware scanning of every upload, limits on how often the service can be used, and no stored documents.</p>
    </Section>
  </>
}

export function TermsContent() {
  return <>
    <p className="muted">Last updated {LEGAL_UPDATED}</p>
    <Section title="What this service is">
      <p>{APP_NAME} helps you prepare bursary applications. It checks your own answers and documents against a bursary's published requirements. It is not a funder, does not decide who gets funding, and a result here never guarantees an outcome. Only the funder decides.</p>
    </Section>
    <Section title="Bursary information">
      <p>Listings are gathered from public sources, some automatically, and may be out of date or wrong. Listings marked as not yet reviewed have not been checked by a person. Always confirm the requirements and deadline on the funder's official page before you apply.</p>
    </Section>
    <Section title="Document checks">
      <p>Document checks read text automatically and can misread it, especially from photos. They do not prove that a document is genuine. Results marked "needs confirmation" need you to check them yourself.</p>
    </Section>
    <Section title="Your part">
      <ul>
        <li>Give true information and upload only your own documents, or documents you are allowed to share.</li>
        <li>Keep your password private, and sign out on shared computers.</li>
        <li>Don't misuse the service, for example by uploading harmful files or trying to access other accounts.</li>
      </ul>
    </Section>
    <Section title="Availability and changes">
      <p>We work to keep {APP_NAME} available and accurate but can't promise it will always be. We may update these terms and will show the date of the latest version here. South African law applies.</p>
    </Section>
    <p>Questions? Contact us at {contact}.</p>
  </>
}

export function SupportContent() {
  return <>
    {SUPPORT_EMAIL && <p>Email us at {contact} and we'll reply within two working days.</p>}
    <Section title="Common questions">
      <dl className="faq">
        <dt>Why does a result say "needs confirmation"?</dt>
        <dd>We couldn't check that item automatically, for example a blurry photo or a rule we can't test, such as citizenship. Check it yourself against the funder's requirements.</dd>
        <dt>Can you read photos of my documents?</dt>
        <dd>Yes. For the best results, photograph the document flat, in good light, with all four corners showing. Digital PDFs are read most accurately.</dd>
        <dt>Are my documents stored?</dt>
        <dd>No. They stay on your device and are only read, then discarded, when you run a document check.</dd>
        <dt>How do I delete my information?</dt>
        <dd>Profile → Delete my account removes everything. Profile → Download my data gives you a copy first.</dd>
        <dt>Is a bursary still open?</dt>
        <dd>We hide bursaries after their closing date, but always confirm the deadline on the funder's site.</dd>
      </dl>
    </Section>
    {!SUPPORT_EMAIL && <p className="muted">A support email address will be listed here.</p>}
  </>
}
