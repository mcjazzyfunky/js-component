import { html, render as uhtmlRender, svg } from './patched-uhtml'

// === exports =======================================================

export { bind, element, html, method, prop, ref, state, svg, Component }

// === types =========================================================

type ComponentConstructor = {
  new (): Component
}

type AttrType =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | PropConverter

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

type PropInfo = { propName: string; hasAttr: false } | AttrInfo

type AttrInfo = {
  propName: string
  hasAttr: true
  attrName: string
  reflect: boolean
  fromPropToAttr: (value: any) => string | null
  fromAttrToProp: (value: string | null) => any
}

type PropInfoMap = Map<string, PropInfo>
type AttrInfoMap = Map<string, AttrInfo>

type Ctrl = {
  getTagName(): string
  getHost(): HTMLElement
  isMounted(): boolean
  refresh(): void
  addLifecycleTask(type: LifecycleType, task: Task): void
}

// === module variables =============================================

let currentCtrl: Ctrl | null = null
const propInfoMapByClass = new Map<ComponentConstructor, PropInfoMap>()
const methodNamesByClass = new Map<ComponentConstructor, Set<string>>()

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

function prop(propConfig: {
  attr: AttrType
  reflect?: boolean
}): (component: Component, propName: string) => void

function prop(arg1: any, arg2?: any): any {
  return arguments.length !== 1
    ? processPropDecorator(arg1, arg2)
    : (proto: Component, propName: string) =>
        processPropDecorator(proto, propName, arg1)
}

function processPropDecorator(
  proto: Component,
  propName: string,
  propConfig?: { attr: AttrType; reflect?: boolean }
): void {
  const componentClass = proto.constructor as ComponentConstructor
  const hasAttr = !!(propConfig && propConfig.attr)
  let propInfoMap = propInfoMapByClass.get(componentClass)

  if (!propInfoMap) {
    propInfoMap = new Map()
    propInfoMapByClass.set(componentClass, propInfoMap)
  }

  if (!hasAttr) {
    propInfoMap.set(propName, {
      propName,
      hasAttr
    })
  } else {
    const { fromPropToAttr, fromAttrToProp } = getPropConv(propConfig!.attr)

    propInfoMap.set(propName, {
      propName,
      hasAttr,
      reflect: !!propConfig?.reflect,
      attrName: convertPropNameToAttrName(propName),
      fromPropToAttr,
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
      set: (newValue: any) => void ((value = newValue), component.refresh())
    })
  }

  Object.defineProperty(target, propertyKey, {
    enumerable: true,

    get(this: any) {
      enhanceComponent(this)
    },

    set(this: any, value: any) {
      enhanceComponent(this, value)
    }
  })
}

function method(proto: Component, methodName: string) {
  let methodNames = methodNamesByClass.get((proto as any).constructor)

  if (!methodNames) {
    methodNames = new Set()
    methodNamesByClass.set((proto as any).constructor, methodNames)
  }

  methodNames.add(methodName)
}

function element(params: {
  tag: string
  styles?: string | string[]
  uses?: ComponentConstructor[]
  slots?: string[]
}): (componentClass: ComponentConstructor) => void {
  let styles: string | null = null // will be used lazy in constructor
  const tagName = params.tag

  return (componentClass) => {
    const propInfoMap = propInfoMapByClass.get(componentClass)
    const attrInfoMap = propInfoMapToAttrInfoMap(propInfoMap)
    const attrNames = !attrInfoMap ? [] : Array.from(attrInfoMap.keys())

    if (customElements.get(tagName)) {
      console.clear()
      location.reload() // TODO!!!!!!!!!!!!!!!
      return
    }

    class CustomElement extends HTMLElement {
      private __component: Component

      static observedAttributes = attrNames

      constructor() {
        super()
        styles === null || (styles = concatStyles(params.styles))
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
          styleElem.append(document.createTextNode(styles))
          shadowRoot.append(styleElem, container)
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
                mountNotifier || (mountNotifier = createNotifier())
                mountNotifier.subscribe(task)
                break

              case 'afterUpdate':
                updateNotifier || (updateNotifier = createNotifier())
                updateNotifier.subscribe(task)
                break

              case 'beforeUnmount':
                unmountNotifier || (unmountNotifier = createNotifier())
                unmountNotifier.subscribe(task)
                break
            }
          }
        }

        let component: Component

        try {
          currentCtrl = ctrl
          this.__component = component = new componentClass()
        } finally {
          currentCtrl = null
        }

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
        const propInfo = attrInfoMap!.get(attrName)!
        const newPropValue = (propInfo as any).fromAttrToProp(newAttrValue)
        ;(this as any)[propInfo.propName] = newPropValue
      }

      getAttribute(attrName: string) {
        const propInfo = attrInfoMap?.get(attrName)

        return propInfo
          ? propInfo.fromAttrToProp((this as any)[propInfo.propName])
          : super.getAttribute(attrName)
      }

      connectedCallback() {
        // this seems to be needed / will be overridden in constructor
        this.connectedCallback()
      }

      disconnectedCallback() {
        // this seems to be needed / will be overridden in constructor
        this.disconnectedCallback()
      }
    }

    addProps(CustomElement.prototype, propInfoMap)
    addMethods(CustomElement.prototype, methodNamesByClass.get(componentClass))
    customElements.define(tagName, CustomElement)
  }
}

// === other API =====================================================

function ref<T>(value: T): { current: T | undefined } {
  return {
    current: value
  }
}

// === Component =====================================================

abstract class Component {
  private __ctrl: Ctrl

  constructor() {
    if (process.env.NODE_ENV === ('development' as string)) {
      if (!currentCtrl) {
        throw new Error(
          'Class "Component" cannot be explicitly instantiated - ' +
            'use decorator "@element" instead'
        )
      }
    }

    this.__ctrl = currentCtrl!
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
    subscribe: (subscriber: () => void) => void subscribers.push(subscriber),
    notify: () => subscribers.forEach((subscriber) => subscriber())
  }
}

// === helpers =======================================================

function convertPropNameToAttrName(propName: string) {
  return propName.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase()
}

function getPropConv(attrType: AttrType): PropConverter {
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

function propInfoMapToAttrInfoMap(
  propInfoMap?: PropInfoMap
): AttrInfoMap | null {
  if (!propInfoMap) {
    return null
  }

  const ret = new Map<string, AttrInfo>()

  for (const propInfo of propInfoMap.values()) {
    if (propInfo.hasAttr) {
      ret.set(propInfo.attrName, propInfo)
    }
  }

  return ret
}

function concatStyles(styles: string | string[] | undefined) {
  return styles ? Array.from(styles).join('\n\n============\n\n') : ''
}

function addProps(proto: HTMLElement, propInfoMap?: PropInfoMap) {
  if (propInfoMap) {
    for (const propInfo of propInfoMap.values()) {
      const propName = propInfo.propName

      Object.defineProperty(proto, propName, {
        enumerable: true,
        get(this: any) {
          return this.__component[propName]
        },

        // TODO
        set(this: any, value: any) {
          this.__component[propName] = value

          if (propInfo.hasAttr && propInfo.reflect) {
            const attrValue = propInfo.fromPropToAttr(value)

            if (typeof attrValue === 'string') {
              HTMLElement.prototype.setAttribute.call(
                this,
                propInfo.attrName,
                attrValue
              )
            } else {
              this.removeAttribute(propInfo.attrName)
            }
          }

          this.__component.refresh() // TODO
        }
      })
    }
  }
}

function addMethods(proto: HTMLElement, methodNames?: Iterable<string>) {
  if (methodNames) {
    for (const methodName of methodNames) {
      ;(proto as any)[methodName] = function (this: any) {
        return this.__component[methodName]()
      }
    }
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
