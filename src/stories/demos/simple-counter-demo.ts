import {
  bind,
  element,
  html,
  prop,
  ref,
  state,
  Component,
  method
} from 'js-component'

@element({
  tag: 'simple-counter'
})
class SimpleCounter extends Component {
  @prop({ attr: Number, reflect: true })
  initialCount = 0

  @prop({ attr: String, reflect: true })
  label = 'Counter'

  @method
  reset() {
    this.count = this.initialCount
  }

  @state
  private count = 0

  @bind
  private onClick() {
    this.count++
  }

  beforeMount() {
    this.reset()
  }

  afterMount() {
    console.log(`Mounted "${this.getTagName()}"`)
  }

  afterUpdate() {
    console.log(`Updated "${this.getTagName()}"`)
  }

  beforeUnmount() {
    console.log(`Unmounting "${this.getTagName()}"`)
  }

  render() {
    return html`
      <button @click=${this.onClick}>${this.label}: ${this.count}</button>
    `
  }
}

@element({
  tag: 'simple-counter-demo',
  uses: [SimpleCounter]
})
export default class SimpleCounterDemo extends Component {
  private counterRef = ref(null)

  @bind
  onReset() {
    ;(this.counterRef.current as any).reset()
  }

  render() {
    return html`
      <div>
        <simple-counter ref=${this.counterRef} label="Counter 1" />
        <button @click=${this.onReset}>Reset</button>
        <hr />
        <simple-counter
          initial-count="100"
          label="Counter 2 (starting with 100)"
        />
      </div>
    `
  }
}
