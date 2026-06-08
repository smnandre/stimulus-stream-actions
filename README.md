# Stimulus Stream Actions

A modern, type-safe way to handle custom Turbo Stream actions directly in your Stimulus controllers. Enjoy clean, controller-scoped logic, automatic lifecycle management, and seamless integration with Turbo and Stimulus.

## Features
- ✨ **Controller-scoped stream actions**: Register actions directly on your Stimulus controllers
- 🧹 **Automatic cleanup**: Actions are managed with the controller lifecycle
- 🧑‍💻 **TypeScript support**: Benefit from full typings for actions and handler signatures
- 🧩 **Flexible configuration**: Configure per-action options and register actions dynamically
- 🧪 **Easy testing**: Test controllers in isolation without global state
- 🚀 **Works with plain Stimulus**: No decorators or build steps required

## Minimal Example

```js
import { Controller } from '@hotwired/stimulus';
import { useStreamActions } from '@smnandre/stimulus-stream-actions';

export default class CartController extends Controller {
  static streamActions = {
    'add_to_cart': 'addToCart',
    'remove_from_cart': 'removeFromCart'
  };

  initialize() {
    useStreamActions(this);
  }

  addToCart({ render }) {
    const productId = render.getAttribute('product-id');
    // ...add to cart logic...
  }

  removeFromCart({ render }) {
    const productId = render.getAttribute('product-id');
    // ...remove from cart logic...
  }
}
```

---

## Why Not Global StreamActions?

Custom Turbo Stream actions typically require **global registration**, creating pollution and maintenance headaches:

```js
import { StreamActions } from "@hotwired/turbo";
StreamActions.closeModal = function() { /* ... */ }
StreamActions.updateCart = function() { /* ... */ }
```

**Problems:**
- Global namespace pollution
- No automatic cleanup
- Hard to test in isolation
- No controller scoping

## The Solution: Controller-Scoped Actions

Scope stream actions directly to your Stimulus controllers with automatic lifecycle management:

```js
static streamActions = {
  'close_modal': 'closeModal',
  'update_cart': 'updateCart',
  'show_notification': 'showNotification'
}
```

## Why This Approach is Better

### Key Benefits
- **No Global Pollution**: Actions are scoped to specific controllers
- **Auto Cleanup**: Actions automatically removed when controller disconnects
- **Better Testing**: Each controller can be tested in isolation
- **Type Safety**: Full TypeScript support with proper typing
- **Zero Build**: No decorators or extra tooling required
- **Controller Context**: Access to `this.element`, targets, values, etc.

## Handler Signature and Parameters

Every stream action handler receives a single object argument:

```js
handler({ target, targets, streamElement, render, action }) {
  // target:        First resolved target element, or null
  // targets:       All resolved target elements (array)
  // streamElement: The <turbo-stream> element that triggered the action
  // render:        Alias of streamElement, kept for backward compatibility
  // action:        The action name (value of the `action` attribute)
}
```
- **target**: The element resolved from the stream's `target="id"` attribute (via `getElementById`), or the first match when the stream uses `targets="selector"`. `null` when neither attribute is set or nothing matches.
- **targets**: All resolved target elements as an array — one element for `target="id"`, many for `targets="selector"`, empty when neither is set.
- **streamElement**: The `<turbo-stream>` element. Use `streamElement.getAttribute('attr')` to read attributes, `streamElement.innerHTML` for content, and `streamElement.querySelector('template')` for the template.
- **render**: The same element as `streamElement`. Kept so handlers that destructure `render` keep working.
- **action**: The action name that matched this handler.
- **newStream**: Also present — Turbo's own name for the element. Identical to `streamElement`.

Target resolution matches Turbo's own: `target` is a single id, `targets` is a CSS selector. Both are resolved against the document.

You can destructure only what you need:
```js
closeModal({ target }) { ... }
```

There is no `event` argument. Whether the default Turbo rendering is prevented is decided by the action config (`preventDefault`), before the handler runs — not from inside it.

## Installation

```bash
npm install @smnandre/stimulus-stream-actions
```

Or via CDN:
```javascript
import { useStreamActions } from 'https://cdn.jsdelivr.net/npm/@smnandre/stimulus-stream-actions@latest';
```

## Basic Usage

### 1. Define Stream Actions on Your Controller

```javascript
import { Controller } from '@hotwired/stimulus';
import { useStreamActions } from '@smnandre/stimulus-stream-actions';

export default class NotificationController extends Controller {
  static streamActions = {
    'show_notification': 'showNotification',
    'hide_all_notifications': 'hideAll'
  };

  initialize() {
    useStreamActions(this);
  }

  showNotification({ render }) {
    const message = render.getAttribute('message');
    const type = render.getAttribute('type') || 'info';
    // Use controller context - this.element, this.targets, etc.
    const notification = this.element.querySelector('[data-notification-template]').cloneNode(true);
    notification.textContent = message;
    notification.className = `notification notification--${type}`;
    this.element.appendChild(notification);
  }

  hideAll() {
    this.element.querySelectorAll('.notification').forEach(notification => {
      notification.remove();
    });
  }
}
```

### 2. Server Response (Any Backend)

**HTML Response:**
```html
<turbo-stream action="show_notification" message="Order completed!" type="success">
  <template></template>
</turbo-stream>

<turbo-stream action="hide_all_notifications">
  <template></template>
</turbo-stream>
```

**The stream elements can be generated by any backend framework that supports Turbo Streams.**

## Advanced Configuration

You can use advanced configuration for each action:

```javascript
static streamActions = {
  'close_modal': 'closeModal',
  'update_content': { method: 'updateContent', preventDefault: false },
  'highlight_modal': 'highlightModal'
};
```
- **method**: The controller method to call
- **preventDefault**: If true (default), prevents the default Turbo Stream rendering. Set to false to allow both your handler and the default behavior.

## Example: Modal Controller

```javascript
export default class ModalController extends Controller {
  static streamActions = {
    'close_modal': 'closeModal',
    'update_content': { method: 'updateContent', preventDefault: false },
    'highlight_modal': 'highlightModal'
  };

  initialize() {
    useStreamActions(this);
  }

  closeModal({ render }) {
    const modalId = render.getAttribute('modal-id');
    if (modalId) {
      this.element.querySelector(`#${modalId}`)?.remove();
    } else {
      this.element.querySelectorAll('[data-modal]').forEach(modal => modal.remove());
    }
  }

  updateContent({ render }) {
    const content = render.innerHTML;
    this.element.querySelectorAll('[data-modal-content]').forEach(area => {
      area.innerHTML = content;
    });
  }

  highlightModal({ render }) {
    const duration = Number(render.getAttribute('duration')) || 2000;
    this.element.querySelectorAll('[data-modal]').forEach(modal => {
      modal.classList.add('modal--highlighted');
      setTimeout(() => modal.classList.remove('modal--highlighted'), duration);
    });
  }
}
```

## Dynamic Stream Actions

For scenarios where actions depend on controller state or values:

```javascript
import { Controller } from '@hotwired/stimulus';
import { useCustomStreamActions } from '@smnandre/stimulus-stream-actions';

export default class DynamicController extends Controller {
  static values = { animated: Boolean, mode: String };

  initialize() {
    const actions = this.animatedValue ? {
      'remove_item': 'animatedRemove',
      'add_item': 'animatedAdd'
    } : {
      'remove_item': 'instantRemove',
      'add_item': 'instantAdd'
    };
    if (this.modeValue === 'admin') {
      actions['bulk_delete'] = 'bulkDelete';
      actions['bulk_update'] = 'bulkUpdate';
    }
    useCustomStreamActions(this, actions);
  }

  animatedRemove({ render }) {
    const itemId = render.getAttribute('item-id');
    const duration = Number(render.getAttribute('duration')) || 300;
    const items = this.element.querySelectorAll(`[data-item-id="${itemId}"]`);
    items.forEach(item => {
      item.style.transition = `opacity ${duration}ms ease-out`;
      item.style.opacity = '0';
      setTimeout(() => item.remove(), duration);
    });
  }

  instantRemove({ render }) {
    const itemId = render.getAttribute('item-id');
    this.element.querySelectorAll(`[data-item-id="${itemId}"]`).forEach(item => {
      item.remove();
    });
  }

  bulkDelete({ render }) {
    const selector = render.getAttribute('selector');
    this.element.querySelectorAll(selector).forEach(item => item.remove());
  }
}
```

## Real-World Example: Multi-Tab Interface

```javascript
export default class TabsController extends Controller {
  static targets = ['tab', 'panel'];
  static streamActions = {
    'activate_tab': 'activateTab',
    'update_tab_content': 'updateTabContent',
    'add_notification_badge': 'addBadge'
  };

  activateTab({ render }) {
    const tabId = render.getAttribute('tab-id');
    this.tabTargets.forEach(tab => tab.classList.remove('active'));
    this.panelTargets.forEach(panel => panel.classList.remove('active'));
    const activeTab = this.element.querySelector(`[data-tab-id="${tabId}"]`);
    const activePanel = this.element.querySelector(`[data-panel-id="${tabId}"]`);
    activeTab?.classList.add('active');
    activePanel?.classList.add('active');
  }

  updateTabContent({ render }) {
    const tabId = render.getAttribute('tab-id');
    const content = render.innerHTML;
    const panel = this.element.querySelector(`[data-panel-id="${tabId}"]`);
    if (panel) panel.innerHTML = content;
  }

  addBadge({ render }) {
    const tabId = render.getAttribute('tab-id');
    const count = Number(render.getAttribute('count')) || 0;
    const tab = this.element.querySelector(`[data-tab-id="${tabId}"]`);
    if (tab) {
      tab.querySelectorAll('.badge').forEach(badge => badge.remove());
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = count.toString();
      tab.appendChild(badge);
    }
  }
}
```

## Handling Regular Turbo Stream Actions

You can also register controller methods for base Turbo Stream actions (like `append`, `update`, etc.) using `static streamActions`. If a controller method is registered for a base action, it is called instead of Turbo's default behavior (unless you set `preventDefault: false`). The handler receives the resolved `target` element, just as Turbo would use it.

**Example:**

```js
export default class ListController extends Controller {
  static streamActions = {
    append: 'handleAppend',
    update: 'handleUpdate'
  };

  initialize() {
    useStreamActions(this);
  }

  handleAppend({ target, streamElement }) {
    const template = streamElement.querySelector('template');
    if (target && template) {
      target.append(template.content.cloneNode(true));
    }
  }

  handleUpdate({ target, streamElement }) {
    const template = streamElement.querySelector('template');
    if (target && template) {
      target.replaceChildren(template.content.cloneNode(true));
    }
  }
}
```

---

## API Reference

### `useStreamActions(controller)`
Enables stream actions defined in the static `streamActions` property.

```javascript
static streamActions = {
  'action_name': 'methodName'
};
```

### `useCustomStreamActions(controller, actions)`
Programmatically registers stream actions for dynamic scenarios.

```javascript
useCustomStreamActions(this, {
  'dynamic_action': 'handleDynamicAction'
});
```

### Stream Action Configuration Schema

```typescript
type StreamActionConfig = string | {
  method: string;              // Controller method name
  preventDefault?: boolean;    // Prevent default Turbo behavior (default: true)
};

type StreamActionMap = Record<string, StreamActionConfig>;
```

### Handler Method Signature

```javascript
handler({ target, targets, streamElement, render, action }) {
  // target:        First resolved target element (or null)
  // targets:       All resolved target elements (array)
  // streamElement: The <turbo-stream> element (render is an alias)
  // action:        The matched action name
  // Example:
  const id = streamElement.getAttribute('item-id');
  const template = streamElement.querySelector('template');
  if (target && template) {
    target.append(template.content.cloneNode(true));
  }
}
```

### Preventing Default Turbo Stream Behavior

By default, your handler will prevent the default Turbo Stream rendering. To allow both your handler and the default behavior, set `preventDefault: false` in your action config:

```js
static streamActions = {
  'update_content': { method: 'updateContent', preventDefault: false }
};
```

### Error Handling

If an error is thrown in your handler, it will be logged to the console in development mode for easier debugging.

## How It Works

1. **Registration**: Controllers register with a global `StreamActionRegistry` on connect
2. **Event Interception**: The registry listens for `turbo:before-stream-render` events
3. **Action Routing**: When a custom action is detected, it routes to the appropriate controller method
4. **Cleanup**: Controllers automatically unregister when they disconnect

**Scope**: Actions trigger for **all** `<turbo-stream>` elements in the DOM. The `turbo:before-stream-render` event bubbles to the document level, so any controller can handle any stream action.

## Testing

```bash
npm install
npm test           # Unit tests with Vitest
npm run test:e2e   # End-to-end tests with Playwright
```

## TypeScript Support

Full TypeScript support with proper type definitions:

```typescript
import { Controller } from '@hotwired/stimulus';
import { useStreamActions, useCustomStreamActions } from '@smnandre/stimulus-stream-actions';

export default class MyController extends Controller {
  static streamActions = {
    'my_action': 'handleMyAction'
  } as const;

  initialize(): void {
    useStreamActions(this);
  }

  handleMyAction({ target, event, render }: { target: Element | null, event: CustomEvent, render: Element }) {
    // Fully typed method
    // ...
  }
}
```

## License

Released under the [MIT License](LICENSE) by [Simon André](https://github.com/smnandre).
