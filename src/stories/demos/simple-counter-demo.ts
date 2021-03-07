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

  beforeMount() {
    this.count = this.initialCount
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
    console.log(this.label, this.initialCount)

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
          initial-count="100"
          label="Counter 2 (starting with 100)"
        />
      </div>
    `
  }
}
