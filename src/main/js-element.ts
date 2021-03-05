// @ts-ignore
import { html } from 'uhtml'

// === exports =======================================================

export { element, prop, state, Component }

// === types =========================================================

type ComponentConstructor = {
  new (elem: HTMLElement): Component
}

type PropMeta = {}
type StateMeta = {}

type ComponentMeta = {
  props: Map<string, PropMeta>
  states: Map<string, StateMeta>
}

// === meta data =====================================================

const componentMetaMap = new Map<ComponentConstructor, ComponentMeta>()

// === decorators ====================================================

function element(params: {
  tag: string
  styles?: string | string[]
  uses?: ComponentConstructor[]
}): (constructor: ComponentConstructor) => void {
  const tagName = params.tag

  // will be used lazy in constructor
  let styles: string | null = null

  return (ComponentClass) => {
    if (customElements.get(tagName)) {
      location.reload() // TODO!!!!
      return
    }

    class CustomElement extends HTMLElement {
      constructor() {
        super()

        if (styles === null) {
          styles = params.styles
            ? Array.from(params.styles).join('\n\n============\n\n')
            : ''
        }

        this.attachShadow({ mode: 'open' })

        const shadowRoot = this.shadowRoot!
        const container = styles ? document.createElement('span') : shadowRoot

        if (styles) {
          const styleElem = document.createElement('style')

          styleElem.appendChild(document.createTextNode(styles))
          shadowRoot.append(styleElem)
          shadowRoot.append(container)
        }

        const component = new ComponentClass(this)

        this.connectedCallback = () => {
          container.innerHTML = '[custom component]'
          component.onMount()
        }

        this.disconnectedCallback = () => {
          component.onUnmount()
        }
      }

      connectedCallback() {
        // will be overridden in constructor
        this.connectedCallback()
      }

      disconnectedCallback() {
        // will be overridden in constructor
        this.disconnectedCallback()
      }
    }

    customElements.define(tagName, CustomElement)
  }
}

function prop() {
  // TODO
}

function state() {
  // TODO
}

// === Component =====================================================

class Component {
  constructor(elem: Element) {
    let updateRequested = false
    let mounted = false

    this.refresh = () => {
      if (updateRequested) {
        return
      }

      window.requestAnimationFrame(() => {
        updateRequested = false
        // TODO
      })
    }
  }

  // @ts-ignore
  getElement(): HTMLElement {
    // will be overriden in constructor
  }

  onMount() {}

  onUpdate() {}

  onUnmount() {}

  refresh() {
    // will be overidden in constructor
  }
}
