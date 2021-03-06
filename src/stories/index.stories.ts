import SimpleCounterDemo from './demos/simple-counter-demo'
import ClockDemo from './demos/clock-demo'

export default {
  title: 'Demos'
}

function demo({ name }: { name: string }): () => string {
  const tagName = toKebabCase(name)
  return () => `<${tagName}></${tagName}>`
}

function toKebabCase(s: string): string {
  const upper = /(?:(?<!\p{Uppercase_Letter})\p{Uppercase_Letter}|\p{Uppercase_Letter}(?!\p{Uppercase_Letter}))/gu
  return s.replace(upper, '-$&').replace(/^-/, '').toLowerCase()
}

export const simpleCounter = demo(SimpleCounterDemo)
export const clock = demo(ClockDemo)
