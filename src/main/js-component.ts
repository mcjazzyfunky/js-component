// @ts-ignore
import { html, render as uhtmlRender, svg } from './patched-uhtml'

// === exports =======================================================

export { bind, element, html, prop, state, svg, Component }

// === types =========================================================

type ComponentConstructor = {
  new (): Component
}

type AttrType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | PropConverter

type PropConfig = {
  attr: AttrType
  reflect?: boolean
}

type Task = () => void

type Notifier = {
  subscribe(subscriber: Task): void
  notify(): void
}

type LifecycleType = 'afterMount' | 'beforeUnmount' | 'afterUpdate'

type PropConverter<T = any> = {
  fromPropToAttr(value: T): string | null
  fromAttrToProp(it: string | null): T
}

type PropInfo =
  | {
      hasAttr: false
    }
  | {
      hasAttr: true
      attrName: string
      reflect: boolean
      fromPropToAttr: (value: any) => string | null
    }

type AttrInfo = {
  propName: string
  reflect: boolean
  fromAttrToProp: (value: string | null) => any
}

type Ctrl = {
  getTagName(): string
  getHost(): HTMLElement
  isMounted(): boolean
  refresh(): void
  addLifecycleTask(type: LifecycleType, task: Task): void
}

type Class<T = any> = {
  new (...args: any[]): T
}

// === module variables =============================================

let currentCtrl: Ctrl | null = null

// === meta data =====================================================

const propInfoMapByClass: Map<Class, Map<string, PropInfo>> = new Map()
const attrInfoMapByClass: Map<Class, Map<string, AttrInfo>> = new Map()

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
  const hasAttr = !!(propConfig && propConfig.attr)
  let propInfoMap = propInfoMapByClass.get(componentClass)
  let attrInfoMap = attrInfoMapByClass.get(componentClass)

  if (!propInfoMap) {
    propInfoMap = new Map()
    propInfoMapByClass.set(componentClass, propInfoMap)

    if (hasAttr) {
      attrInfoMap = new Map()
      attrInfoMapByClass.set(componentClass, attrInfoMap)
    }
  }

  if (!hasAttr) {
    propInfoMap.set(propName, {
      hasAttr
    })
  } else {
    const attrName = convertPropNameToAttrName(propName)
    const reflect = !!propConfig?.reflect

    const { fromPropToAttr, fromAttrToProp } = getPropConvByAttrType(
      propConfig!.attr
    )

    propInfoMap.set(propName, {
      hasAttr,
      reflect,
      attrName: attrName,
      fromPropToAttr
    })

    attrInfoMap!.set(attrName, {
      propName,
      reflect,
      fromAttrToProp
    })
  }
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
    const propInfoMap = propInfoMapByClass.get(componentClass)
    const attrInfoMap = attrInfoMapByClass.get(componentClass)
    const attrNames = attrInfoMap ? Array.from(attrInfoMap.keys()) : []

    if (customElements.get(tagName)) {
      console.clear()
      location.reload() // TODO!!!!
      return
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
        const render = () => uhtmlRender(container, component.render())

        if (styles) {
          const styleElem = document.createElement('style')

          styleElem.appendChild(document.createTextNode(styles))
          shadowRoot.append(styleElem)
          shadowRoot.append(container)
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

        let component: Component

        try {
          currentCtrl = ctrl
          component = new componentClass()
        } finally {
          currentCtrl = null
        }

        this.__component = component
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
        oldAttrValue: string,
        newAttrValue: string
      ) {
        const attrInfo = attrInfoMap!.get(attrName)!
        const propName = attrInfo?.propName
        const mapToProp = attrInfo.fromAttrToProp
        const newPropValue = mapToProp(newAttrValue)
        ;(this as any)[propName] = newPropValue
      }

      getAttribute(attrName: string) {
        const attrInfo = attrInfoMap?.get(attrName)

        if (!attrInfo) {
          return super.getAttribute(attrName)
        }

        const propName = attrInfo.propName
        const mapToAttr = attrInfo.fromAttrToProp

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

    if (propInfoMap) {
      for (const [propName, propInfo] of propInfoMap.entries()) {
        Object.defineProperty(CustomElement.prototype, propName, {
          enumerable: true,
          get(this: any) {
            return this.__component[propName]
          },

          // TODO
          set(this: any, value: any) {
            this.__component[propName] = value
            this.__component.refresh() // TODO
          }
        })
      }
    }

    customElements.define(tagName, CustomElement)
  }
}

// === Component =====================================================

abstract class Component {
  private __ctrl: Ctrl

  constructor() {
    if (!currentCtrl) {
      throw new Error(
        'Class "Component" cannot be explicitly instantiated - ' +
          'use decorator "@element" instead'
      )
    }

    this.__ctrl = currentCtrl
    currentCtrl = null
  }

  getTagName(): string {
    return this.__ctrl.getTagName()
  }

  getHost(): HTMLElement {
    return this.__ctrl.getHost()
  }

  isMounted(): boolean {
    return this.__ctrl.isMounted()
  }

  refresh() {
    this.__ctrl.refresh()
  }

  addLifecycleTask(type: LifecycleType, task: Task) {
    this.__ctrl.addLifecycleTask(type, task)
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

function convertPropNameToAttrName(propName: string) {
  return propName.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

function getPropConvByAttrType(attrType: AttrType): PropConverter {
  switch (attrType) {
    case String:
      return stringPropConverter

    case Number:
      return numberPropConverter

    case Boolean:
      return booleanPropConverter

    default:
      return attrType as PropConverter
  }
}

// === prop converters ===============================================

const stringPropConverter: PropConverter<string> = {
  fromPropToAttr: (it: string) => it,
  fromAttrToProp: (it: string) => it
}

const numberPropConverter: PropConverter<number> = {
  fromPropToAttr: (it: number) => String(it),
  fromAttrToProp: (it: string) => Number.parseFloat(it)
}

const booleanPropConverter: PropConverter<boolean> = {
  fromPropToAttr: (it: boolean) => (it ? 'true' : 'false'),
  fromAttrToProp: (it: string) => (it === 'true' ? true : false)
}

// ====================================================================
