import React from 'react'
import { BuilderBlock } from '../decorators/builder-block.decorator'
import { BuilderElement, builder } from '@builder.io/sdk'
import { BuilderStoreContext } from '../store/builder-store'
import { BuilderPage } from '../components/builder-page.component'

export interface RouterProps {
  model?: string
  data?: string
  content?: string
  handleRouting?: boolean
  builderBlock?: BuilderElement
  preloadOnHover?: boolean
  onRoute?: (routeEvent: RouteEvent) => void
}

// TODO: share this
function searchToObject(location: HTMLAnchorElement) {
  const pairs = (location.search || '').substring(1).split('&')
  const obj: { [key: string]: string } = {}

  for (const i in pairs) {
    if (pairs[i] === '') continue
    const pair = pairs[i].split('=')
    obj[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1])
  }

  return obj
}

export interface RouteEvent {
  /**
   * Url being routed to
   */
  url: string
  /**
   * Html anchor element the href is on that
   * caused the route
   */
  anchorNode: HTMLAnchorElement
  /**
   * Has preventDefault() been called preventing
   * builder from routing to the clicked URL
   */
  defaultPrevented: boolean
  /**
   * Prevents builder from handling routing for you to handle
   * yourself
   */
  preventDefault(): void
}

@BuilderBlock({
  // Builder:Router?
  name: 'Core:Router',
  hideFromInsertMenu: true,
  // TODO: advanced: true
  inputs: [
    {
      // TODO: search picker
      name: 'model',
      type: 'string',
      defaultValue: 'page',
      advanced: true
    },
    {
      name: 'handleRouting',
      type: 'boolean',
      defaultValue: true,
      advanced: true
    },
    {
      name: 'preloadOnHover',
      type: 'boolean',
      defaultValue: true,
      advanced: true
    },
    {
      name: 'onRoute',
      type: 'function',
      advanced: true
      // Subfields are function arguments - object with properties
    }
  ]
})
export class Router extends React.Component<RouterProps> {
  private preloadQueue = 0

  public route(url: string) {
    const parsed = this.parseUrl(url)
    // TODO: check if relative?
    if (window.history && window.history.pushState) {
      history.pushState(null, '', url)
      if (this.privateState) {
        // Reload path info
        this.privateState.update(obj => ({
          ...obj,
          location: {
            ...obj.location,
            pathname: parsed.pathname,
            search: parsed.search,
            path: parsed.pathname.split('/').slice(1),
            query: searchToObject(parsed)
          }
        }))
      }
    } else {
      location.href = url
    }
  }

  private get model() {
    return this.props.model || 'page'
  }

  componentDidMount() {
    if (typeof document !== 'undefined') {
      document.addEventListener('click', this.onClick)
      document.addEventListener('mouseover', this.onMouseOverOrTouchStart)
      document.addEventListener('touchstart', this.onMouseOverOrTouchStart)
    }
  }

  componentWillUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('click', this.onClick)
      document.removeEventListener('mouseover', this.onMouseOverOrTouchStart)
      document.removeEventListener('touchstart', this.onMouseOverOrTouchStart)
    }
  }

  private onMouseOverOrTouchStart = (event: MouseEvent | TouchEvent) => {
    if (this.preloadQueue > 4) {
      return
    }

    if (this.props.preloadOnHover === false) {
      return
    }

    const hrefTarget = this.findHrefTarget(event)
    if (!hrefTarget) {
      return
    }

    let href = hrefTarget.getAttribute('href')
    if (!href) {
      return
    }

    // TODO: onPreload hook and preload dom event
    // Also allow that to be defaultPrevented to cancel this behavior
    if (!this.isRelative(href)) {
      const converted = this.convertToRelative(href)
      if (converted) {
        href = converted
      } else {
        return
      }
    }

    if (href.startsWith('#')) {
      return
    }

    const parsedUrl = this.parseUrl(href)

    // TODO: override location!
    this.preloadQueue++

    const attributes = builder.getUserAttributes()
    attributes.urlPath = parsedUrl.pathname
    attributes.queryString = parsedUrl.search

    // Should be queue?
    const subscription = builder
      .get(this.model, {
        userAttributes: attributes
      })
      .subscribe(() => {
        this.preloadQueue--
        subscription.unsubscribe()
      })
  }

  private onClick = async (event: MouseEvent) => {
    if (this.props.handleRouting === false) {
      return
    }

    if (event.button !== 0 || event.ctrlKey || event.defaultPrevented || event.metaKey) {
      // If this is a non-left click, or the user is holding ctr/cmd, or the url is absolute,
      // or if the link has a target attribute, don't route on the client and let the default
      // href property handle the navigation
      return
    }

    const hrefTarget = this.findHrefTarget(event)
    if (!hrefTarget) {
      return
    }

    // target="_blank" or target="_self" etc
    if (hrefTarget.target && hrefTarget.target !== '_client') {
      return
    }

    let href = hrefTarget.getAttribute('href')
    if (!href) {
      return
    }

    if (this.props.onRoute) {
      const routeEvent: RouteEvent = {
        url: href,
        anchorNode: hrefTarget,
        preventDefault() {
          this.defaultPrevented = true
        },
        defaultPrevented: false
      }

      this.props.onRoute(routeEvent)

      if (routeEvent.defaultPrevented) {
        // Wait should this be here? they may want browser to handle this by deault preventing ours...
        // event.preventDefault()
        return
      }
    }

    if (!this.isRelative(href)) {
      const converted = this.convertToRelative(href)
      if (converted) {
        href = converted
      } else {
        return
      }
    }

    if (href.startsWith('#')) {
      return
    }

    // Otherwise if this url is relative, navigate on the client
    event.preventDefault()

    this.route(href)
  }

  render() {
    const { model } = this
    return (
      <BuilderStoreContext.Consumer>
        {state => {
          this.privateState = state
          return (
            <div className="builder-router" data-model={model}>
              {/* TODO: loading icon on route */}
              {/* TODO: default site styles */}
              <style>{`
                @keyframes builderLoadingSpinner {
                  0% {
                    transform: rotate(0deg);
                  }
                  100% {
                    transform: rotate(360deg);
                  }
                }
                /* TODO: overridable tag */
                .builder-page-loading {
                  -webkit-animation: builderLoadingSpinner 1s infinite linear;
                  animation: builderLoadingSpinner 1s infinite linear;
                  -webkit-transform: translateZ(0);
                  transform: translateZ(0);
                  border-radius: 50%;
                  width: 36px;
                  height: 36px;
                  margin: 6px auto;
                  position: relative;
                  border: 1px solid transparent;
                  border-left: 1px solid #808284;
                }
              `}</style>
              <BuilderPage
                key={
                  state.state &&
                  state.state.location &&
                  state.state.location.pathname + state.state.location.search
                }
                data={this.props.data}
                content={this.props.content}
                modelName={model}
              >
                {/* TODO: builder blocks option for loading stuff */}
                {/* TODO: input for builder blocks for this */}
                {this.props.children || (
                  <div style={{ display: 'flex' }}>
                    <div style={{ margin: '40vh auto' }} className="builder-page-loading" />
                  </div>
                )}
              </BuilderPage>
            </div>
          )
        }}
      </BuilderStoreContext.Consumer>
    )
  }

  private findHrefTarget(event: MouseEvent | TouchEvent): HTMLAnchorElement | null {
    // TODO: move to core
    let element = event.target as HTMLElement | null

    while (element) {
      if (element instanceof HTMLAnchorElement && element.getAttribute('href')) {
        return element
      }

      if (element === event.currentTarget) {
        break
      }

      element = element.parentElement
    }

    return null
  }

  private isRelative(href: string) {
    return !href.match(/^(\/\/|https?:\/\/)/i)
  }

  private privateState: {
    state: any
    update: (mutator: (state: any) => any) => void
  } | null = null

  // This method can only be called client side only. It is only invoked on click events
  private parseUrl(url: string) {
    const a = document.createElement('a')
    a.href = url
    return a
  }

  private convertToRelative(href: string): string | null {
    const currentUrl = this.parseUrl(location.href)
    const hrefUrl = this.parseUrl(href)

    if (currentUrl.host === hrefUrl.host) {
      const relativeUrl = hrefUrl.pathname + (hrefUrl.search ? hrefUrl.search : '')

      if (relativeUrl.startsWith('#')) {
        return null
      }
      return relativeUrl || '/'
    }

    return null
  }
}