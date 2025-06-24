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
class StreamActionRegistry {
  private static instance: StreamActionRegistry;
  private controllers = new Set<Controller>();
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
   * Handles the turbo:before-stream-render event.
   * Finds all controllers that can handle the action and calls their methods.
   * 
   * @param event - The Turbo stream render event
   * @private
   */
  private handleStreamRender = (event: Event) => {
    const customEvent = event as CustomEvent;
    const { action, render } = customEvent.detail;
    
    // Validate event structure
    if (!action || !render) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
        console.warn('Invalid turbo:before-stream-render event detail:', customEvent.detail);
      }
      return;
    }
    
    // Find controllers that handle this action
    for (const controller of this.controllers) {
      const ctor = controller.constructor as any;
      const staticActions: StreamActionMap = ctor.streamActions || {};
      const customActions: StreamActionMap = (controller as any)._customStreamActions || {};
      
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
          event.preventDefault();
        }

        const handler = (controller as any)[methodName];
        if (handler && typeof handler === 'function' && controller.element.isConnected) {
          try {
            // Create a better DX object for accessing stream data
            const streamData = {
              target: render.target,
              event: customEvent,
              // Easy attribute access
              get(attributeName: string, fallback?: string): string | null {
                const value = render.getAttribute(attributeName);
                return value !== null ? value : (fallback ?? null);
              },
              // Get all attributes as an object
              get attributes(): Record<string, string> {
                const attrs: Record<string, string> = {};
                if (render.attributes && render.attributes.length) {
                  for (let i = 0; i < render.attributes.length; i++) {
                    const attr = render.attributes[i];
                    attrs[attr.name] = attr.value;
                  }
                }
                return attrs;
              },
              // Get content from the stream
              get content(): string {
                return render.innerHTML || '';
              },
              // Get boolean attribute
              getBoolean(attributeName: string): boolean {
                const value = render.getAttribute(attributeName);
                return value !== null && value !== 'false' && value !== '0';
              },
              // Get number attribute
              getNumber(attributeName: string, fallback = 0): number {
                const value = render.getAttribute(attributeName);
                const parsed = value ? parseFloat(value) : NaN;
                return isNaN(parsed) ? fallback : parsed;
              },
              // Get JSON attribute
              getJSON<T = any>(attributeName: string, fallback: T | null = null): T | null {
                const value = render.getAttribute(attributeName);
                if (!value) return fallback;
                try {
                  return JSON.parse(value);
                } catch {
                  return fallback;
                }
              }
            };

            handler.call(controller, streamData);
          } catch (error) {
            if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
              console.error(`Error in stream action handler '${methodName}':`, error);
            }
          }
        } else if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
          if (!handler) {
            console.warn(`Stream action method '${methodName}' not found on controller`, controller);
          } else if (typeof handler !== 'function') {
            console.warn(`Stream action '${methodName}' is not a function on controller`, controller);
          }
        }
      }
    }
  };

  /**
   * Registers a controller with the registry.
   * Automatically starts listening for turbo:before-stream-render events
   * if this is the first controller.
   * 
   * @param controller - The Stimulus controller to register
   */
  register(controller: Controller) {
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
  unregister(controller: Controller) {
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
    (controller as any)._customStreamActions = customActions;
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
  const ctor = controller.constructor as any;
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
