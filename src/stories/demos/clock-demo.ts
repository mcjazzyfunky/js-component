import { bind, element, html, prop, state, Component } from 'js-element'

@element({
  tag: 'clock-demo'
})
class ClockDemo extends Component {
  label = 'Current time'

  private getTime = useTimer(this, 1000)

  render() {
    return html`
      <div>${this.label}: ${this.getTime().toLocaleTimeString()}</div>
    `
  }
}

function useTimer(component: Component, milliseconds: number) {
  let currentTime = new Date()
  let intervalId: any = null

  component.addLifecycleTask('mount', () => {
    intervalId = setInterval(() => {
      currentTime = new Date()
      component.refresh()
    }, milliseconds)
  })

  component.addLifecycleTask('unmount', () => {
    clearInterval(intervalId)
  })

  return () => currentTime
}

export default ClockDemo
