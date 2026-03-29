import { lazy, Suspense, Component, type ReactNode } from 'react'
import { Routes, Route, useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { GridSkeleton } from './components/Skeleton'

// Lazy-loaded pages
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })))
const MovieDetail = lazy(() => import('./pages/MovieDetail').then(m => ({ default: m.MovieDetail })))
const Browse = lazy(() => import('./pages/Browse').then(m => ({ default: m.Browse })))
const GenreBrowse = lazy(() => import('./pages/GenreBrowse').then(m => ({ default: m.GenreBrowse })))
const YearBrowse = lazy(() => import('./pages/YearBrowse').then(m => ({ default: m.YearBrowse })))
const Search = lazy(() => import('./pages/Search').then(m => ({ default: m.Search })))
const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })))
const API = lazy(() => import('./pages/API').then(m => ({ default: m.API })))
const Export = lazy(() => import('./pages/Export').then(m => ({ default: m.Export })))

// Error boundary
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-white px-4">
          <div className="text-center">
            <h1 className="font-display text-text-primary text-3xl mb-4">Something went wrong</h1>
            <p className="text-text-secondary font-body mb-6">An unexpected error occurred.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.href = '/' }}
              className="text-text-primary hover:text-text-muted font-body font-medium cursor-pointer underline"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-16">
      <div className="text-center">
        <h1 className="font-display text-text-primary text-4xl mb-4">404</h1>
        <p className="text-text-secondary font-body mb-6">Page not found.</p>
        <Link to="/" className="text-accent hover:text-accent-hover font-body font-medium">
          ← Back to Home
        </Link>
      </div>
    </div>
  )
}

function PageLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 pt-24 pb-12">
      <GridSkeleton count={10} />
    </div>
  )
}

function AnimatedPage({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion()
  if (reduced) return <>{children}</>

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

export function App() {
  const location = useLocation()

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-bg-base">
        {/* Skip to content */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-bg-base focus:font-body focus:font-medium"
        >
          Skip to content
        </a>

        <Header />
        <main id="main-content" aria-label="Main content">
          <Suspense fallback={<PageLoading />}>
            <AnimatePresence mode="wait" initial={false}>
              <AnimatedPage key={location.pathname}>
                <Routes location={location}>
                  <Route path="/" element={<Home />} />
                  <Route path="/movie/:slug" element={<MovieDetail />} />
                  <Route path="/browse" element={<Browse />} />
                  <Route path="/browse/genre/:genre" element={<GenreBrowse />} />
                  <Route path="/browse/year/:year" element={<YearBrowse />} />
                  <Route path="/search" element={<Search />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/api-docs" element={<API />} />
                  <Route path="/export" element={<Export />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AnimatedPage>
            </AnimatePresence>
          </Suspense>
        </main>
        <Footer />
      </div>
    </ErrorBoundary>
  )
}
