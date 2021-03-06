// @ts-ignore
import { html, render as uhtmlRender, svg } from './patched-uhtml'

// === exports =======================================================

export { bind, element, html, prop, state, svg, Component }

// === types =========================================================

type Content = any // TODO

type ComponentConstructor = {
  new (ctrl: Ctrl): Component
}

type PropMeta = {}
type StateMeta = {}

type ComponentMeta = {
  props: Map<string, PropMeta>
  states: Map<string, StateMeta>
  methodsToBind: string[]
}

type Task = () => void

type Notifier = {
  subscribe(subscriber: Task): void
  notify(): void
}

type LifecycleType = 'mount' | 'unmount' | 'update'

type Ctrl = {
  getTagName(): string
  getHost(): HTMLElement
  isMounted(): boolean
  refresh(): void
  addLifecyleTask(type: LifecycleType, task: Task): void
}

// === meta data =====================================================

const componentMetaMap = new Map<ComponentConstructor, ComponentMeta>()

// === decorators ====================================================

function bind<T extends Function>(
  target: object,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new TypeError(
      `Only methods can be decorated with @callback. <${propertyKey}> is not a method!`
    )
  }

  return {
    configurable: true,

    get(this: any): any {
      const bound: any = descriptor.value!.bind(this)

      Object.defineProperty(this, propertyKey, {
        value: bound,
        configurable: true,
        writable: true
      })

      return bound
    }
  }
}

function prop() {
  // TODO
}

function state(target: Component, propertyKey: string): void {
  const valueMap = new WeakMap<Function, any>()

  const enhanceComponent = (component: Component, initialValue?: any) => {
    let value: any = initialValue

    Object.defineProperty(component, propertyKey, {
      enumerable: true,
      get: () => value,

      set: (newValue: any) => {
        value = newValue
        component.refresh()
      }
    })
  }

  Object.defineProperty(target, propertyKey, {
    enumerable: true,

    get(this: any) {
      enhanceComponent(this)
      // return undefined - just for documentation
    },

    set(this: any, value: any) {
      enhanceComponent(this, value)
    }
  })
}

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
      console.clear()
      location.reload() // TODO!!!!
      return
    }

    let metaMap = componentMetaMap.get(ComponentClass) || null

    if (metaMap) {
      componentMetaMap.delete(ComponentClass)
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

        let mounted = false
        let updateRequested = false
        let mountNotifier: Notifier | null = null
        let updateNotifier: Notifier | null = null
        let unmountNotifier: Notifier | null = null

        const shadowRoot = this.shadowRoot!
        const container = styles ? document.createElement('span') : shadowRoot

        if (styles) {
          const styleElem = document.createElement('style')

          styleElem.appendChild(document.createTextNode(styles))
          shadowRoot.append(styleElem)
          shadowRoot.append(container)
        }

        const render = () => {
          uhtmlRender(container, component.render())
          mounted && updateNotifier && updateNotifier.notify()
        }

        const ctrl: Ctrl = {
          getTagName: () => tagName,
          getHost: () => this,
          isMounted: () => mounted,

          refresh() {
            if (!mounted || updateRequested) {
              return
            }

            updateRequested = true

            requestAnimationFrame(() => {
              updateRequested = false
              render()
            })
          },

          addLifecyleTask(type: LifecycleType, task: Task) {
            switch (type) {
              case 'mount':
                if (!mountNotifier) {
                  mountNotifier = createNotifier()
                }

                mountNotifier.subscribe(task)
                break

              case 'update':
                if (!updateNotifier) {
                  updateNotifier = createNotifier()
                }

                updateNotifier.subscribe(task)
                break

              case 'unmount':
                if (!unmountNotifier) {
                  unmountNotifier = createNotifier()
                }

                unmountNotifier.subscribe(task)
                break
            }
          }
        }

        const component = new ComponentClass(ctrl)
        component.init()

        this.connectedCallback = () => {
          render()
          mounted = true
          mountNotifier && mountNotifier.notify()
          component.onMount()
        }

        this.disconnectedCallback = () => {
          unmountNotifier && unmountNotifier.notify()
          component.onUnmount()
          container.innerHTML = ''
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

// === Component =====================================================

class Component {
  constructor(ctrl: Ctrl) {
    this.getTagName = ctrl.getTagName
    this.getHost = ctrl.getHost
    this.isMounted = ctrl.isMounted
    this.refresh = ctrl.refresh
    this.addLifecycleTask = ctrl.addLifecyleTask
  }

  // @ts-ignore
  getTagName(): string {
    // will be overriden in constructor
  }

  // @ts-ignore
  getHost(): HTMLElement {
    // will be overriden in constructor
  }

  // @ts-ignore
  isMounted(): boolean {
    // will be overriden in constructor
  }

  refresh() {
    // will be overidden in constructor
  }

  addLifecycleTask(type: LifecycleType, task: Task) {
    // will be overidden in constructor
  }

  init() {}
  onMount() {}
  onUpdate() {}
  onUnmount() {}
  render() {}
}

// === createNotifier ================================================

function createNotifier(): Notifier {
  const subscribers: (() => void)[] = []

  return {
    subscribe(subscriber: () => void) {
      subscribers.push(subscriber)
    },

    notify() {
      subscribers.forEach((subscriber) => subscriber())
    }
  }
}

// === helpers =======================================================
