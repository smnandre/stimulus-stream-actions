import { Controller } from '@hotwired/stimulus';

/**
 * Configuration for a stream action handler.
 * Can be either a simple method name string or an object with additional options.
 * 
 * @example
 * // Simple string configuration
 * 'close_modal': 'closeModal'
 * 
 * @example
 * // Object configuration with options
 * 'close_modal': { method: 'closeModal', preventDefault: false }
 */
type StreamActionConfig = string | {
  /** The name of the controller method to call when this action is triggered */
  method: string;
  /** Whether to prevent the default Turbo Stream behavior. Defaults to true. */
  preventDefault?: boolean;
};

/**
 * A mapping of stream action names to their configurations.
 * Used in the static streamActions property of Stimulus controllers.
 * 
 * @example
 * static streamActions = {
 *   'close_modal': 'closeModal',
 *   'update_cart': { method: 'updateCart', preventDefault: false }
 * }
 */
type StreamActionMap = Record<string, StreamActionConfig>;

/**
 * Singleton registry that manages all controllers with stream actions.
 * Handles the global turbo:before-stream-render event and routes actions
 * to the appropriate controller methods.
 * 
 * This class automatically manages the document event listener lifecycle,
 * adding it when the first controller is registered and removing it when
 * the last controller is unregistered.
 */
export class StreamActionRegistry {
  private static instance: StreamActionRegistry;
  private controllers = new Set<Controller<Element>>();
  private isListening = false;

  /**
   * Gets the singleton instance of the StreamActionRegistry.
   * Creates the instance if it doesn't exist.
   * 
   * @returns The singleton StreamActionRegistry instance
   */
  static getInstance(): StreamActionRegistry {
    if (!StreamActionRegistry.instance) {
      StreamActionRegistry.instance = new StreamActionRegistry();
    }
    return StreamActionRegistry.instance;
  }

  /**
   * Resets the singleton instance.
   * ONLY FOR TESTING PURPOSES.
   */
  static resetInstance() {
    StreamActionRegistry.instance = new StreamActionRegistry();
  }

  /**
   * Handles the turbo:before-stream-render event.
   * Finds all controllers that can handle the action and calls their methods.
   * 
   * @param event - The Turbo stream render event
   * @private
   */
  private handleStreamRender = (event: Event) => {
    const customEvent = event as CustomEvent;
    // In Turbo 8, the stream element is in `newStream`.
    const streamElement = customEvent.detail.newStream as HTMLElement | undefined;

    if (!streamElement) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.warn('stimulus-stream-actions: turbo:before-stream-render event is missing newStream in detail.', customEvent.detail);
      }
      return;
    }

    const action = streamElement.getAttribute('action');
    if (!action) {
      return;
    }
    
    // Find controllers that handle this action
    for (const controller of this.controllers) {
      const ctor = controller.constructor as { streamActions?: StreamActionMap };
      const staticActions: StreamActionMap = ctor.streamActions || {};
      const customActions: StreamActionMap = (controller as {_customStreamActions?: StreamActionMap})._customStreamActions || {};
      
      // Custom actions take precedence over static actions
      const actions = { ...staticActions, ...customActions };
      const config = actions[action];
      
      if (config) {
        let methodName: string;
        let preventDefault = true;

        if (typeof config === 'string') {
          methodName = config;
        } else {
          methodName = config.method;
          preventDefault = config.preventDefault ?? true;
        }

        if (preventDefault) {
          customEvent.preventDefault();
        }

        const method = (controller as unknown as Record<string, unknown>)[methodName];

        if (typeof method === 'function') {
          try {
            // Pass streamElement as `render` for backward-compatibility.
            // Also pass as `streamElement` for clarity.
            method.call(controller, { ...customEvent.detail, action, render: streamElement, streamElement });
          } catch (error) {
            if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
              console.error(`Error in stream action \"${action}\" (${methodName}):`, error);
            }
          }
        } else {
          if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
            console.warn(`Stream action \"${action}\" references undefined method \"${methodName}\" on controller`, controller);
          }
        }
      }
    }
  }

  /**
   * Registers a controller with the registry.
   * Automatically starts listening for turbo:before-stream-render events
   * if this is the first controller.
   * 
   * @param controller - The Stimulus controller to register
   */
  register(controller: Controller<Element>) {
    this.controllers.add(controller);
    
    if (!this.isListening) {
      document.addEventListener('turbo:before-stream-render', this.handleStreamRender);
      this.isListening = true;
    }
  }

  /**
   * Unregisters a controller from the registry.
   * Automatically stops listening for turbo:before-stream-render events
   * if this was the last controller.
   * 
   * @param controller - The Stimulus controller to unregister
   */
  unregister(controller: Controller<Element>) {
    this.controllers.delete(controller);
    
    if (this.controllers.size === 0 && this.isListening) {
      document.removeEventListener('turbo:before-stream-render', this.handleStreamRender);
      this.isListening = false;
    }
  }

  /**
   * Gets the number of currently registered controllers.
   * Useful for testing and debugging.
   * 
   * @returns The number of registered controllers
   */
  getControllerCount(): number {
    return this.controllers.size;
  }

  /**
   * Checks if the registry is currently listening for events.
   * Useful for testing and debugging.
   * 
   * @returns Whether the registry is listening for events
   */
  isListeningForEvents(): boolean {
    return this.isListening;
  }
}

/**
 * Wires up stream actions for a controller by patching its connect/disconnect methods.
 * This function monkey-patches the controller's lifecycle methods to automatically
 * register/unregister with the StreamActionRegistry.
 * 
 * @param controller - The Stimulus controller to wire up
 * @param customActions - Optional custom stream actions to use instead of static ones
 * @private
 */
function wireStreamActions(controller: Controller, customActions?: StreamActionMap) {
  const registry = StreamActionRegistry.getInstance();
  const originalConnect = controller.connect?.bind(controller);
  const originalDisconnect = controller.disconnect?.bind(controller);

  // Store custom actions on the controller if provided
  if (customActions) {
    (controller as {_customStreamActions?: StreamActionMap})._customStreamActions = customActions;
  }

  controller.connect = function () {
    originalConnect?.();
    registry.register(this);
  };

  controller.disconnect = function () {
    registry.unregister(this);
    originalDisconnect?.();
  };
}

/**
 * Enables stream actions for a Stimulus controller using static streamActions configuration.
 * This function reads the static streamActions property from the controller class
 * and wires up the necessary event handling.
 * 
 * @param controller - The Stimulus controller instance
 * 
 * @example
 * ```typescript
 * export default class ModalController extends Controller {
 *   static streamActions = {
 *     'close_modal': 'closeModal',
 *     'open_modal': { method: 'openModal', preventDefault: false }
 *   };
 * 
 *   initialize() {
 *     useStreamActions(this);
 *   }
 * 
 *   closeModal(streamData) {
 *     const modalId = streamData.get('modal-id');
 *     // Handle close modal action with easy attribute access
 *   }
 * 
 *   openModal(streamData) {
 *     const size = streamData.get('size', 'medium'); // with fallback
 *     // Handle open modal action
 *   }
 * }
 * ```
 */
export function useStreamActions(controller: Controller) {
  const ctor = controller.constructor as { streamActions?: StreamActionMap };
  const streamActions: StreamActionMap | undefined = ctor.streamActions;
  
  if (streamActions) {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      // Validate streamActions configuration
      for (const [action, config] of Object.entries(streamActions)) {
        if (typeof config !== 'string' && typeof config !== 'object') {
          console.warn(`Invalid stream action config for '${action}':`, config);
        }
        if (typeof config === 'object' && !config.method) {
          console.warn(`Stream action '${action}' is missing method property:`, config);
        }
      }
    }
    
    wireStreamActions(controller);
  } else if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    console.warn('useStreamActions called on controller without static streamActions property:', controller);
  }
}

/**
 * Enables custom stream actions for a Stimulus controller using imperative configuration.
 * This function allows you to define stream actions programmatically, useful for
 * dynamic scenarios where actions depend on controller state or values.
 * 
 * @param controller - The Stimulus controller instance
 * @param actions - The stream actions configuration map
 * 
 * @example
 * ```typescript
 * export default class DynamicController extends Controller {
 *   static values = { animated: Boolean };
 * 
 *   initialize() {
 *     const actions = this.animatedValue ? {
 *       'fade_out': 'animatedRemove',
 *       'slide_in': 'animatedShow'
 *     } : {
 *       'remove': 'instantRemove',
 *       'show': 'instantShow'
 *     };
 * 
 *     useCustomStreamActions(this, actions);
 *   }
 * 
 *   animatedRemove(streamData) {
 *     const duration = streamData.getNumber('duration', 300);
 *     // Handle animated removal with typed attribute access
 *   }
 * 
 *   instantRemove(streamData) {
 *     const confirmed = streamData.getBoolean('confirmed');
 *     // Handle instant removal
 *   }
 * }
 * ```
 */
export function useCustomStreamActions(controller: Controller, actions: StreamActionMap) {
  if (!actions || typeof actions !== 'object') {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      console.warn('useCustomStreamActions called with invalid actions:', actions);
    }
    return;
  }

  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    // Validate custom actions configuration
    for (const [action, config] of Object.entries(actions)) {
      if (typeof config !== 'string' && typeof config !== 'object') {
        console.warn(`Invalid custom stream action config for '${action}':`, config);
      }
      if (typeof config === 'object' && !config.method) {
        console.warn(`Custom stream action '${action}' is missing method property:`, config);
      }
    }
  }

  wireStreamActions(controller, actions);
}
