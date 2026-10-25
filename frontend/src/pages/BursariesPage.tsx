import { Link, useSearchParams } from 'react-router-dom'
import { userDetails, useAuth } from '../auth/AuthProvider'
import { BursaryCard, byDeadline, byMatch, closingSoon, fitsProfile, isOpen, matchReasons } from '../components/bursary'
import { Icon } from '../components/icons'
import { AlertBanner, EmptyState, Segmented } from '../components/ui'
import { getBursaries } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import type { Bursary } from '../models'
import { useWorkspace } from '../workspace/WorkspaceProvider'

type Tab = 'all' | 'for_you' | 'closing' | 'saved'

export function BursariesPage() {
  const { session } = useAuth()
  const { saved } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const profile = userDetails(session?.user)
  // Students who told us their field land on their matches; "All" is one tap away.
  const tab = (['all', 'for_you', 'closing', 'saved'].includes(params.get('tab') ?? '') ? params.get('tab') : profile.field_of_study ? 'for_you' : 'all') as Tab
  const field = profile.field_of_study
  const { data, error, loading, reload } = useAsync(() => getBursaries(), [])

  const set = (key: string, value: string) => setParams(p => { if (value) p.set(key, value); else p.delete(key); return p }, { replace: true })
  const q = query.trim().toLowerCase()
  const open = (data ?? []).filter(isOpen).sort(byDeadline)
  const forYou = (b: Bursary) => !!field && fitsProfile(b, profile)
  const inTab: Record<Tab, (b: Bursary) => boolean> = { all: () => true, for_you: forYou, closing: closingSoon, saved: b => saved.includes(b.id) }
  // Search covers what a bursary funds and pays for too, so "electrical" or "accommodation" finds it.
  const haystack = (b: Bursary) => [b.title, b.funder, ...b.faculties, ...b.courses, ...(b.covers ?? [])].join(' ').toLowerCase().replace(/_/g, ' ')
  const visible = open.filter(b => inTab[tab](b) && (!q || haystack(b).includes(q)))
  if (tab === 'for_you') visible.sort(byMatch(profile))
  const tabs = [['all', 'All', open.length], ['for_you', 'For you'], ['closing', 'Closing soon'], ['saved', 'Saved', saved.length]] as const

  const empty: Record<Tab, [string, string]> = {
    all: ['No bursaries match', 'Try a different word, or clear the search.'],
    for_you: field ? ['Nothing for your field yet', 'No open bursary matches your field of study right now.'] : ['Tell us your field of study', 'Add it to your profile and we\'ll show bursaries that fund it.'],
    closing: ['Nothing closing soon', 'No open bursary closes in the next 30 days.'],
    saved: ['No saved bursaries', 'Tap the bookmark on a bursary to keep it here.'],
  }

  return <div className="tab-page">
    <header className="page-title">
      <h1>Bursaries</h1>
      <label className="search-field"><Icon name="search" size={18} /><span className="sr-only">Search bursaries</span>
        <input type="search" placeholder="Search bursaries, courses, funders" value={query} onChange={e => set('q', e.target.value)} />
      </label>
      <Segmented label="Filter bursaries" options={tabs} value={tab} onChange={v => set('tab', v)} />
    </header>
    <div className="page-body">
      {data?.some(b => b.status === 'draft') && <AlertBanner tone="warning">Most listings are gathered automatically from public bursary sites. Confirm the details on the funder's site before you apply.</AlertBanner>}
      {loading ? <div className="card-grid"><div className="bursary-card skeleton-block" /><div className="bursary-card skeleton-block" /></div>
        : error ? <AlertBanner tone="danger" title="Couldn't load bursaries" action={<button className="btn btn-secondary btn-sm" onClick={reload}>Try again</button>}>{error}</AlertBanner>
        : visible.length ? <div className="card-grid">{visible.map(b => <BursaryCard key={b.id} bursary={b} reasons={matchReasons(b, profile)} />)}</div>
        : <div className="soft-panel"><EmptyState icon={tab === 'saved' ? 'bookmark' : 'search'} title={empty[tab][0]}
            action={tab === 'for_you' && !field ? <Link className="btn btn-primary" to="/profile">Add field of study</Link> : q ? <button className="btn btn-secondary" onClick={() => set('q', '')}>Clear search</button> : undefined}>{empty[tab][1]}</EmptyState></div>}
    </div>
  </div>
}
