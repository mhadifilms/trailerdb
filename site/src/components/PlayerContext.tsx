import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'

interface PlayerContextType {
  activeId: string | null
  setActive: (id: string | null) => void
}

const PlayerContext = createContext<PlayerContextType>({ activeId: null, setActive: () => {} })

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const setActive = useCallback((id: string | null) => setActiveId(id), [])
  const value = useMemo(() => ({ activeId, setActive }), [activeId, setActive])

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}
