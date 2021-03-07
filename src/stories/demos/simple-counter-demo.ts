import { bind, element, html, prop, state, Component } from 'js-element'

@element({
  tag: 'simple-counter'
})
class SimpleCounter extends Component {
  @prop({ attr: Number })
  initialCount = 0

  @prop({ attr: String })
  label = 'Counter'

  @state
  private count = 0

  @bind
  private onClick() {
    this.count++
  }

  init() {
    this.count = this.initialCount
  }

  onMount() {
    console.log(`Mounted "${this.getTagName()}"`)
  }

  onUpdate() {
    console.log(`Updated "${this.getTagName()}"`)
  }

  onUnmount() {
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
  render() {
    return html`
      <div>
        <simple-counter label="Counter 1" />
        <simple-counter
          label="Counter 2 (starting with 100)"
          initialCount="0"
        />
      </div>
    `
  }
}
