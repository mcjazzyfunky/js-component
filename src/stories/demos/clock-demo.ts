import { bind, element, html, prop, state, Component } from 'js-element'

@element({
  tag: 'clock-demo'
})
class ClockDemo extends Component {
  @prop({ attr: String })
  label = 'Current time'

  getTime: () => Date = null as any // TODO

  beforeMount() {
    this.getTime = useTimer(this, 1000) // TODO
  }

  render() {
    return html`
      <div>${this.label}: ${this.getTime().toLocaleTimeString()}</div>
    `
  }
}

function useTimer(component: Component, milliseconds: number) {
  let currentTime = new Date()
  let intervalId: any = null

  component.addLifecycleTask('afterMount', () => {
    intervalId = setInterval(() => {
      currentTime = new Date()
      component.refresh()
    }, milliseconds)
  })

  component.addLifecycleTask('beforeUnmount', () => {
    clearInterval(intervalId)
  })

  return () => currentTime
}

export default ClockDemo
