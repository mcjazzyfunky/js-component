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

// === module variables =============================================

let currentCtrl: any = null

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

    const {
      propNames,
      attrNames,
      propNameToAttrNameObj,
      attrNameToPropNameObj,
      propNameToP2AObj,
      propNameToA2PObj,
      reflectedPropsObj
    } = getPropsMetaByPropConfigMap(
      propConfigsByComponentClass.get(componentClass)
    )

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
        const propName = attrNameToPropNameObj[attrName]
        const mapToProp = propNameToA2PObj[propName]
        const newPropValue = mapToProp(newAttrValue)
        ;(this as any)[propName] = newPropValue
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

        // TODO
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
  constructor() {
    if (currentCtrl) {
      Object.assign(this, currentCtrl)
      currentCtrl = null
    }
  }

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

function getPropsMetaByPropConfigMap(propConfigsMap?: PropConfigMap) {
  const ret = {
    propNames: [] as string[],
    attrNames: [] as string[],
    propNameToAttrNameObj: {} as Record<string, string>,
    attrNameToPropNameObj: {} as Record<string, string>,
    propNameToP2AObj: {} as Record<string, (propValue: any) => string | null>,
    propNameToA2PObj: {} as Record<string, (attrValue: string | null) => any>,
    reflectedPropsObj: {} as Record<string, true>
  }

  if (propConfigsMap) {
    for (const [propName, propConfig] of propConfigsMap.entries()) {
      ret.propNames.push(propName)

      if (propConfig && propConfig.attr) {
        const attrName = convertPropNameToAttrName(propName)
        let conv = getPropConvByAttrType(propConfig.attr)

        ret.attrNames.push(attrName)
        ret.propNameToAttrNameObj[propName] = attrName
        ret.attrNameToPropNameObj[attrName] = propName

        if (propConfig.reflect) {
          ret.reflectedPropsObj[propName] = true
        }

        ret.propNameToP2AObj[propName] = conv.fromPropToString
        ret.propNameToA2PObj[propName] = conv.fromStringToProp
      }
    }
  }

  return ret
}

// === prop converters ===============================================

const stringPropConverter: PropConverter<string> = {
  fromPropToString: (it: string) => it,
  fromStringToProp: (it: string) => it
}

const numberPropConverter: PropConverter<number> = {
  fromPropToString: (it: number) => String(it),
  fromStringToProp: (it: string) => Number.parseFloat(it)
}

const booleanPropConverter: PropConverter<boolean> = {
  fromPropToString: (it: boolean) => (it ? 'true' : 'false'),
  fromStringToProp: (it: string) => (it === 'true' ? true : false)
}
