import { Link } from 'react-router-dom'
import { Brand } from '../components/AppShell'
import { Icon, type IconName } from '../components/icons'
import { APP_NAME } from '../lib/brand'
import { PrivacyContent, SupportContent, TermsContent } from './LegalPages'

export interface FeatureCard { icon: IconName; title: string; description: string }

const features: FeatureCard[] = [
  { icon: 'search', title: 'Find bursaries', description: 'Open bursaries for your field and year, with deadlines up front.' },
  { icon: 'circleCheck', title: 'Check eligibility', description: 'See if you qualify before you spend time applying.' },
  { icon: 'upload', title: 'Ready your documents', description: 'Know exactly which documents each bursary needs and which you still lack.' },
  { icon: 'clipboard', title: 'Track applications', description: 'Every bursary you\'re preparing for, with progress, in one place.' },
]

export function PublicHeader({ light }: { light?: boolean }) {
  return <header className={`public-header${light ? ' on-blue' : ''}`}>
    <Brand light={light} />
    <nav aria-label="Account"><Link className="btn btn-ghost" to="/login">Log in</Link><Link className={`btn ${light ? 'btn-white' : 'btn-primary'}`} to="/signup">Sign up</Link></nav>
  </header>
}

export function PublicFooter() {
  return <footer className="public-footer">
    <span>© {new Date().getFullYear()} {APP_NAME}</span>
    <nav aria-label="Legal"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/support">Support</Link></nav>
  </footer>
}

function PhoneMock() {
  return <div className="phone" aria-hidden="true">
    <div className="phone-screen">
      <div className="mock-head"><span className="mock-avatar" /><div><b>Hello, Thandi</b><i>Let's find your next bursary</i></div></div>
      <div className="mock-search" />
      <div className="mock-hero"><b>2 bursaries open now</b><i>Check if you qualify</i><span>View bursaries</span></div>
      <div className="mock-tiles">{['check', 'upload', 'clipboard', 'user'].map(i => <span key={i}><Icon name={i as IconName} size={14} /></span>)}</div>
      <div className="mock-card"><b>Engineering Bursary</b><i>Closes in 12 days</i><span className="mock-bar">Apply</span></div>
      <div className="mock-status"><i>Eligibility</i><span className="ok">Eligible</span><i>Documents</i><span className="warn">80% ready</span></div>
    </div>
  </div>
}

export function LandingPage() {
  return <div className="public-page">
    <section className="landing-hero">
      <PublicHeader light />
      <div className="landing-hero-inner">
        <div className="landing-copy">
          <span className="eyebrow light">FOR SOUTH AFRICAN STUDENTS</span>
          <h1>Find a bursary. Know you're ready.</h1>
          <p>{APP_NAME} checks two things before you apply: whether you qualify, and whether your documents are complete. No surprises after the deadline.</p>
          <div className="hero-actions"><Link className="btn btn-white btn-lg" to="/signup">Get started free<Icon name="arrowRight" size={18} /></Link><Link className="btn btn-outline-light btn-lg" to="/login">Log in</Link></div>
        </div>
        <PhoneMock />
      </div>
    </section>
    <main>
      <section className="feature-grid" aria-label="Features">
        {features.map(f => <article className="feature-card" key={f.title}><span className="feature-icon"><Icon name={f.icon} /></span><h2>{f.title}</h2><p>{f.description}</p></article>)}
      </section>
      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How it works</h2>
        <ol>
          <li><span>1</span><strong>Pick a bursary</strong><p>Browse open bursaries or search by name.</p></li>
          <li><span>2</span><strong>Answer a few questions</strong><p>About two minutes. Upload documents if you have them.</p></li>
          <li><span>3</span><strong>Get your result</strong><p>Eligibility and documents, shown separately, with your next step.</p></li>
        </ol>
      </section>
      <section className="trust" aria-label="About checks">
        <Icon name="shield" /><p><strong>We check readiness, not funding.</strong> Only the funder decides who is funded, and a check can't prove a document is genuine. Your files are read to check them, never stored.</p>
      </section>
    </main>
    <PublicFooter />
  </div>
}

const infoPages = {
  privacy: ['Privacy notice', PrivacyContent],
  terms: ['Terms of use', TermsContent],
  support: ['Help & support', SupportContent],
} as const

export function InfoPage({ page }: { page: keyof typeof infoPages }) {
  const [title, Body] = infoPages[page]
  return <div className="public-page"><PublicHeader /><main className="info-page"><h1>{title}</h1><Body /><Link className="text-link" to="/">← Back to home</Link></main><PublicFooter /></div>
}
