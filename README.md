# js-component

A R&D project to evaluate a class-based solution to develop custom elements.

#### Disclaimer:

Project is in an early state ... currently no plans to use it in production.

## Examples

### Example 1

```tsx
import { bind, element, html, method, state, Component } from 'js-component'
import counterStyles from './styles/counter.scss'

@element({
  tag: 'my-counter',
  styles: counterStyles
})
class Counter extends Component {
  @prop({ attr: String })
  label = 'Counter'

  @method
  reset() {
    this.count = 0
  }

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
```
