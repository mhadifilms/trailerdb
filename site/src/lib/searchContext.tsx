import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

interface SearchContextType {
  isOpen: boolean
  prefill: string
  open: (query?: string) => void
  close: () => void
  clearPrefill: () => void
}

const SearchContext = createContext<SearchContextType>({
  isOpen: false, prefill: '', open: () => {}, close: () => {}, clearPrefill: () => {},
})

export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [prefill, setPrefill] = useState('')

  const open = useCallback((query?: string) => {
    if (query) setPrefill(query)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => { setIsOpen(false); setPrefill('') }, [])
  const clearPrefill = useCallback(() => setPrefill(''), [])

  const value = useMemo(() => ({ isOpen, prefill, open, close, clearPrefill }), [isOpen, prefill, open, close, clearPrefill])

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearch() {
  return useContext(SearchContext)
}
