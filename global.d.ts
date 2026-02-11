import 'react'

declare module 'ai/react' {
  export function useChat(options?: any): any
  const _default: any
  export default _default
}

declare module 'ai' {
  const whatever: any
  export default whatever
}

declare module '@ai-sdk/google' {
  const whatever: any
  export default whatever
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elem: string]: any
    }
  }
}

export {}

// Augment React types for packages that reference `ReactSVG`
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ReactSVG = any
}
