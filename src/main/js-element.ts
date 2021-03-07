// @ts-ignore
import { html, render as uhtmlRender, svg } from './patched-uhtml'

// === exports =======================================================

export { bind, element, html, prop, state, svg, Component }

// === types =========================================================

type ComponentConstructor = {
  new (): Component
}

type PropConfig = {
  attr: StringConstructor | NumberConstructor | BooleanConstructor
  reflect?: boolean
}

type PropConfigMap = Map<string, PropConfig | null>
type Task = () => void

type Notifier = {
  subscribe(subscriber: Task): void
  notify(): void
}

type LifecycleType = 'afterMount' | 'beforeUnmount' | 'afterUpdate'

type PropConverter<T = any> = {
  fromPropToString(value: T): string | null
  fromStringToProp(it: string | null): T
}

// === meta data =====================================================

const propConfigsByComponentClass = new Map<
  ComponentConstructor,
  PropConfigMap
>()

// === decorators ====================================================

function bind<T extends Function>(
  target: object,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>
): TypedPropertyDescriptor<T> {
  if (process.env.NODE_ENV === ('development' as string)) {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new TypeError(
        `Only methods can be decorated with @callback. <${propertyKey}> is not a method!`
      )
    }
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

function prop(component: Component, propName: string): void

function prop(
  propConfig: PropConfig
): (component: Component, propName: string) => void

function prop(arg1: any, arg2?: any): any {
  const argc = arguments.length

  if (argc == 1) {
    return (proto: Component, propName: string) => {
      processPropDecorator(proto, propName, arg1)
    }
  } else {
    processPropDecorator(arg1, arg2)
  }
}

function processPropDecorator(
  proto: Component,
  propName: string,
  propConfig?: PropConfig
) {
  const componentClass = proto.constructor as ComponentConstructor
  let propConfigsMap = propConfigsByComponentClass.get(componentClass)

  if (!propConfigsMap) {
    propConfigsMap = new Map()
    propConfigsByComponentClass.set(componentClass, propConfigsMap)
  }

  propConfigsMap.set(propName, propConfig || null)
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
}): (componentClass: ComponentConstructor) => void {
  const tagName = params.tag

  // will be used lazy in constructor
  let styles: string | null = null

  return (componentClass) => {
    const proto = componentClass.prototype

    if (customElements.get(tagName)) {
      console.clear()
      location.reload() // TODO!!!!
      return
    }

    const propNames: string[] = []
    const attrNames: string[] = []
    const propNameToAttrNameObj: Record<string, string> = {}
    const attrNameToPropNameObj: Record<string, string> = {}

    const propNameToP2AObj: Record<
      string,
      (propValue: any) => string | null
    > = {}

    const propNameToA2PObj: Record<
      string,
      (attrValue: string | null) => any
    > = {}

    const propConfigsMap = propConfigsByComponentClass.get(componentClass)

    if (propConfigsMap) {
      for (const [propName, propConfig] of propConfigsMap.entries()) {
        propNames.push(propName)

        if (propConfig && propConfig.attr) {
          const attrName = propToAttrName(propName)
          let conv: PropConverter

          attrNames.push(attrName)
          propNameToAttrNameObj[propName] = attrName
          attrNameToPropNameObj[attrName] = propName

          switch (propConfig.attr) {
            case String:
              conv = stringPropConv
              break

            case Number:
              conv = numberPropConv
              break

            case Boolean:
              conv = booleanPropConv
              break
          }

          propNameToP2AObj[propName] = conv!.fromPropToString
          propNameToA2PObj[propName] = conv!.fromStringToProp
        }
      }
    }

    class CustomElement extends HTMLElement {
      private __component: Component

      static observedAttributes = attrNames

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
        }

        const ctrl = {
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
              updateNotifier && updateNotifier.notify()
              component.afterUpdate()
            })
          },

          addLifecycleTask(type: LifecycleType, task: Task) {
            switch (type) {
              case 'afterMount':
                if (!mountNotifier) {
                  mountNotifier = createNotifier()
                }

                mountNotifier.subscribe(task)
                break

              case 'afterUpdate':
                if (!updateNotifier) {
                  updateNotifier = createNotifier()
                }

                updateNotifier.subscribe(task)
                break

              case 'beforeUnmount':
                if (!unmountNotifier) {
                  unmountNotifier = createNotifier()
                }

                unmountNotifier.subscribe(task)
                break
            }
          }
        }

        const component = new componentClass()
        this.__component = component
        Object.assign(component, ctrl)
        component.init() // TODO

        this.connectedCallback = () => {
          component.beforeMount() // TODO
          render()
          mounted = true
          mountNotifier && mountNotifier.notify()
          component.afterMount()
        }

        this.disconnectedCallback = () => {
          unmountNotifier && unmountNotifier.notify()
          component.beforeUnmount()
          container.innerHTML = ''
        }
      }

      attributeChangedCallback(
        attrName: string,
        oldValue: string,
        newValue: string
      ) {
        const propName = attrNameToPropNameObj[attrName]
        const mapToProp = propNameToA2PObj[propName]
        ;(this as any)[propName] = mapToProp(newValue)
      }

      getAttribute(attrName: string) {
        if (!attrNameToPropNameObj.hasOwnProperty('attrName')) {
          return super.getAttribute(attrName)
        }

        const propName = attrNameToPropNameObj[attrName]
        const mapToAttr = propNameToA2PObj[propName]

        return mapToAttr((this as any)[propName])
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

    propNames.forEach((propName) => {
      Object.defineProperty(CustomElement.prototype, propName, {
        enumerable: true,
        get(this: any) {
          return this.__component[propName]
        },

        set(this: any, value: any) {
          this.__component[propName] = value
          this.__component.refresh() // TODO
        }
      })
    })

    customElements.define(tagName, CustomElement)
  }
}

// === Component =====================================================

const notImplementedError = new Error('Method not implemented/overridden')

abstract class Component {
  getTagName(): string {
    // will be overriden by @element decorator
    throw new Error('Method "getTagName" not implemented/overridden')
  }

  getHost(): HTMLElement {
    // will be overriden by @element decorator
    throw new Error('Method "getHost" not implemented/overridden')
  }

  isMounted(): boolean {
    // will be overriden by @element decorator
    throw new Error('Method "isMounted" not implemented/overridden')
  }

  refresh() {
    // will be overriden by @element decorator
    throw new Error('Method "refresh" not implemented/overridden')
  }

  addLifecycleTask(type: LifecycleType, task: Task) {
    // will be overriden by @element decorator
    throw new Error('Method "addLifecycleTask" not implemented/overridden')
  }

  init() {}
  beforeMount() {}
  afterMount() {}
  afterUpdate() {}
  beforeUnmount() {}
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

function propToAttrName(propName: string) {
  return propName.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

// === prop converters ===============================================

const stringPropConv = {
  fromPropToString: (it: string) => it,
  fromStringToProp: (it: string) => it
}

const numberPropConv = {
  fromPropToString: (it: number) => String(it),
  fromStringToProp: (it: string) => Number.parseFloat(it)
}

const booleanPropConv = {
  fromPropToString: (it: boolean) => (it ? 'true' : 'false'),
  fromStringToProp: (it: string) => (it === 'true' ? true : false)
}
