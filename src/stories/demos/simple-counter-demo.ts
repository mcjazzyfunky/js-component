import { bind, element, html, prop, state, Component } from 'js-element'

@element({
  tag: 'simple-counter'
})
class SimpleCounter extends Component {
  label = 'Counter'

  @state
  private count = 0

  @bind
  private onClick() {
    this.count++
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
        <simple-counter .label="Counter 1" />
        <simple-counter .label="Counter 2" />
      </div>
    `
  }
}
