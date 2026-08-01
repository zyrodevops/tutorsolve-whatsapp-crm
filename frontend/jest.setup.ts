import '@testing-library/jest-dom'

// jsdom doesn't implement matchMedia. Parse out min-width so responsive
// components see a result consistent with jsdom's default 1024px viewport.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) => {
    const minWidthMatch = query.match(/min-width:\s*(\d+)px/)
    const matches = minWidthMatch ? window.innerWidth >= parseInt(minWidthMatch[1], 10) : false
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList
  }
}
