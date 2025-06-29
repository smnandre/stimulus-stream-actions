import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStreamActions, useCustomStreamActions, StreamActionRegistry } from '../src/stimulus-stream-actions';
import { Controller } from '@hotwired/stimulus';

class MockController extends Controller {
  static streamActions: Record<string, any> = {};
  connected = false;

  onTestAction = vi.fn();
  onAnotherAction = vi.fn();
  onPreventDefaultAction = vi.fn();
  onNonPreventDefaultAction = vi.fn();
  onCustomAction = vi.fn();
  onDynamicAction = vi.fn();

  constructor(element: HTMLElement) {
    super({ scope: { element } } as any);
  }

  connect(): void {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  cleanup() {
    this.element.remove();
  }
}

describe('Stimulus Stream Actions', () => {
  let controller: MockController;
  let element: HTMLElement;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    element = document.createElement('div');
    document.body.appendChild(element);
    controller = new MockController(element);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.cleanup();
    vi.resetAllMocks();
    document.body.innerHTML = '';
    StreamActionRegistry.resetInstance();
  });

  describe('useStreamActions', () => {
    it('should register stream actions from static property', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'test_action');

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });

      document.dispatchEvent(event);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      const handlerArg = controller.onTestAction.mock.calls[0][0];
      expect(handlerArg).toHaveProperty('streamElement');
      expect(handlerArg.streamElement).toBe(streamElement);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should handle multiple actions', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction',
        'another_action': 'onAnotherAction'
      };

      useStreamActions(controller);
      controller.connect();

      const streamElement1 = document.createElement('div');
      streamElement1.setAttribute('action', 'test_action');
      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement1,
        },
        cancelable: true
      });
      document.dispatchEvent(event1);

      const streamElement2 = document.createElement('div');
      streamElement2.setAttribute('action', 'another_action');
      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement2,
        },
        cancelable: true
      });
      document.dispatchEvent(event2);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      expect(controller.onAnotherAction).toHaveBeenCalledTimes(1);
    });

    it('should handle object configuration with preventDefault', () => {
      MockController.streamActions = {
        'prevent_action': { method: 'onPreventDefaultAction', preventDefault: true },
        'allow_action': { method: 'onNonPreventDefaultAction', preventDefault: false }
      };

      useStreamActions(controller);
      controller.connect();

      const streamElement1 = document.createElement('div');
      streamElement1.setAttribute('action', 'prevent_action');
      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement1,
        },
        cancelable: true
      });
      document.dispatchEvent(event1);

      const streamElement2 = document.createElement('div');
      streamElement2.setAttribute('action', 'allow_action');
      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement2,
        },
        cancelable: true
      });
      document.dispatchEvent(event2);

      expect(controller.onPreventDefaultAction).toHaveBeenCalledTimes(1);
      expect(controller.onNonPreventDefaultAction).toHaveBeenCalledTimes(1);
      expect(event1.defaultPrevented).toBe(true);
      expect(event2.defaultPrevented).toBe(false);
    });

    it('should not trigger actions when controller is disconnected', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();
      controller.disconnect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'test_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(controller.onTestAction).not.toHaveBeenCalled();
    });

    it('should warn when called without streamActions', () => {
      delete (MockController as any).streamActions;
      useStreamActions(controller);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'useStreamActions called on controller without static streamActions property:',
        controller
      );
    });

    it('should validate streamActions configuration in development', () => {
      MockController.streamActions = {
        'valid_action': 'onTestAction',
        'invalid_action': 123,
        'missing_method': { preventDefault: true }
      };

      useStreamActions(controller);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid stream action config for 'invalid_action':",
        123
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Stream action 'missing_method' is missing method property:",
        { preventDefault: true }
      );
    });

    it('should warn when method does not exist', () => {
      MockController.streamActions = {
        'nonexistent_action': 'nonExistentMethod'
      };

      useStreamActions(controller);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'nonexistent_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Stream action \"nonexistent_action\" references undefined method \"nonExistentMethod\" on controller',
        controller
      );
    });

    it('should handle errors in action handlers', () => {
      const errorMethod = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      MockController.streamActions = {
        'error_action': 'errorMethod'
      };

      (controller as any).errorMethod = errorMethod;
      useStreamActions(controller);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'error_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(errorMethod).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error in stream action \"error_action\" (errorMethod):',
        expect.any(Error)
      );
    });
  });

  describe('useCustomStreamActions', () => {
    it('should register custom stream actions', () => {
      const customActions = {
        'custom_action': 'onCustomAction'
      };

      useCustomStreamActions(controller, customActions);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'custom_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(controller.onCustomAction).toHaveBeenCalledTimes(1);
    });

    it('should override static actions with custom actions', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      const customActions = {
        'test_action': 'onCustomAction'
      };

      useStreamActions(controller);
      useCustomStreamActions(controller, customActions);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'test_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(controller.onTestAction).not.toHaveBeenCalled();
      expect(controller.onCustomAction).toHaveBeenCalledTimes(1);
    });

    it('should warn with invalid actions parameter', () => {
      useCustomStreamActions(controller, null as any);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'useCustomStreamActions called with invalid actions:',
        null
      );

      useCustomStreamActions(controller, 'invalid' as any);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'useCustomStreamActions called with invalid actions:',
        'invalid'
      );
    });

    it('should validate custom actions configuration', () => {
      const invalidActions = {
        'valid_action': 'onCustomAction',
        'invalid_action': 123,
        'missing_method': { preventDefault: true }
      };

      useCustomStreamActions(controller, invalidActions);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Invalid custom stream action config for 'invalid_action':",
        123
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Custom stream action 'missing_method' is missing method property:",
        { preventDefault: true }
      );
    });
  });

  describe('StreamActionRegistry', () => {
    it('should manage multiple controllers', () => {
      const controller2 = new MockController(document.createElement('div'));

      MockController.streamActions = {
        'shared_action': 'onTestAction'
      };

      useStreamActions(controller);
      useStreamActions(controller2);

      controller.connect();
      controller2.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'shared_action');
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      expect(controller2.onTestAction).toHaveBeenCalledTimes(1);

      controller2.cleanup();
    });

    it('should handle invalid event structure', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();

      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {}
      });
      document.dispatchEvent(event1);

      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: null
        }
      });
      document.dispatchEvent(event2);

      expect(controller.onTestAction).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'stimulus-stream-actions: turbo:before-stream-render event is missing newStream in detail.',
        {}
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'stimulus-stream-actions: turbo:before-stream-render event is missing newStream in detail.',
        { newStream: null }
      );
    });

    it('should preserve original connect/disconnect methods', () => {
      const originalConnect = vi.fn();
      const originalDisconnect = vi.fn();

      controller.connect = originalConnect;
      controller.disconnect = originalDisconnect;

      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);

      controller.connect();
      controller.disconnect();

      expect(originalConnect).toHaveBeenCalledTimes(1);
      expect(originalDisconnect).toHaveBeenCalledTimes(1);
    });

    it('should return the number of registered controllers', () => {
      const registry = StreamActionRegistry.getInstance();
      registry.register(controller);
      expect(registry.getControllerCount()).toBe(1);
      registry.unregister(controller);
      expect(registry.getControllerCount()).toBe(0);
    });

    it('should indicate if it is listening for events', () => {
      const registry = StreamActionRegistry.getInstance();
      expect(registry.isListeningForEvents()).toBe(false);
      registry.register(controller);
      expect(registry.isListeningForEvents()).toBe(true);
      registry.unregister(controller);
      expect(registry.isListeningForEvents()).toBe(false);
    });
  });

  describe('Event attributes', () => {
    it('should pass render attributes to handler', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();

      const streamElement = document.createElement('div');
      streamElement.setAttribute('action', 'test_action');
      streamElement.setAttribute('modal-id', 'modal-123');
      streamElement.setAttribute('size', 'large');
      streamElement.innerHTML = '<div>test content</div>';

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          newStream: streamElement,
        },
        cancelable: true
      });

      document.dispatchEvent(event);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      const streamData = controller.onTestAction.mock.calls[0][0];
      expect(streamData.streamElement).toBe(streamElement);
    });
  });

  describe('Coverage', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production');
    });

    it('should not warn in production for useStreamActions', () => {
      delete (controller.constructor as any).streamActions;
      useStreamActions(controller);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not warn in production for useCustomStreamActions with invalid actions', () => {
      useCustomStreamActions(controller, null as any);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not warn in production for useCustomStreamActions with invalid config', () => {
      const invalidActions = {
        'invalid_action': 123,
      };
      useCustomStreamActions(controller, invalidActions);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Coverage for controllers without lifecycle methods', () => {
    class ControllerWithoutLifecycleCallbacks extends Controller {
      static streamActions = { 'test': 'test' };
      constructor(element: HTMLElement) {
        super({ scope: { element } } as any);
      }

      connect = undefined;
      disconnect = undefined;

      test() {}
    }

    it('should handle controllers without connect/disconnect methods', () => {
      const element = document.createElement('div');
      const controller = new ControllerWithoutLifecycleCallbacks(element);

      expect(() => useStreamActions(controller)).not.toThrow();

      expect(() => controller.connect?.()).not.toThrow();
      expect(() => controller.disconnect?.()).not.toThrow();
    });
  });
});

