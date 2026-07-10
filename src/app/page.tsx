'use client'

import dynamic from 'next/dynamic'

// DnDSolo uses browser-only APIs (localStorage, fetch, AbortController) and a
// large internal engine, so we render it client-only to avoid SSR mismatches
// and to keep the server bundle small.
const DnDSolo = dynamic(() => import('@/components/DnDSolo').then(m => m.default), {
  ssr: false,
  loading: () => (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
      Loading the campaign...
    </div>
  ),
})

export default function Home() {
  return <DnDSolo />
}
