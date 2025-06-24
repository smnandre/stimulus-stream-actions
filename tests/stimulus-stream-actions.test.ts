import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useStreamActions, useCustomStreamActions } from '../src/stimulus-stream-actions';

// Set up environment for development warnings
vi.stubEnv('NODE_ENV', 'development');

class MockController {
  static streamActions: Record<string, any> = {};
  element: HTMLElement;
  connected = false;
  
  onTestAction = vi.fn();
  onAnotherAction = vi.fn();
  onPreventDefaultAction = vi.fn();
  onNonPreventDefaultAction = vi.fn();
  onCustomAction = vi.fn();
  onDynamicAction = vi.fn();

  constructor() {
    this.element = document.createElement('div');
    document.body.appendChild(this.element);
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
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    controller = new MockController();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.cleanup();
    vi.resetAllMocks();
    document.body.innerHTML = '';
    
    // Clean up any event listeners
    const events = ['turbo:before-stream-render'];
    events.forEach(event => {
      document.removeEventListener(event, () => {});
    });
  });

  describe('useStreamActions', () => {
    it('should register stream actions from static property', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();

      // Simulate turbo stream event
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action',
          render: {
            target: null,
            getAttribute: vi.fn()
          }
        },
        cancelable: true
      });

      document.dispatchEvent(event);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    });

    it('should handle multiple actions', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction',
        'another_action': 'onAnotherAction'
      };

      useStreamActions(controller);
      controller.connect();

      // Test first action
      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action',
          render: { target: null, getAttribute: vi.fn() }
        },
        cancelable: true
      });
      document.dispatchEvent(event1);

      // Test second action
      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'another_action',
          render: { target: null, getAttribute: vi.fn() }
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

      // Test preventDefault: true
      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'prevent_action',
          render: { target: null, getAttribute: vi.fn() }
        },
        cancelable: true
      });
      document.dispatchEvent(event1);

      // Test preventDefault: false
      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'allow_action',
          render: { target: null, getAttribute: vi.fn() }
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

      // Remove from DOM to simulate disconnection
      controller.element.remove();

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action',
          render: { target: null, getAttribute: vi.fn() }
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

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'nonexistent_action',
          render: { target: null, getAttribute: vi.fn() }
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Stream action method 'nonExistentMethod' not found on controller",
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

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'error_action',
          render: { target: null, getAttribute: vi.fn() }
        },
        cancelable: true
      });
      document.dispatchEvent(event);

      expect(errorMethod).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Error in stream action handler 'errorMethod':",
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

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'custom_action',
          render: { target: null, getAttribute: vi.fn() }
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

      useStreamActions(controller); // First set up static actions
      useCustomStreamActions(controller, customActions); // Then override with custom
      controller.connect();

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action',
          render: { target: null, getAttribute: vi.fn() }
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
      const controller2 = new MockController();
      
      MockController.streamActions = {
        'shared_action': 'onTestAction'
      };

      useStreamActions(controller);
      useStreamActions(controller2);
      
      controller.connect();
      controller2.connect();

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'shared_action',
          render: { target: null, getAttribute: vi.fn() }
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

      // Event with missing action
      const event1 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          render: { target: null, getAttribute: vi.fn() }
        }
      });
      document.dispatchEvent(event1);

      // Event with missing render
      const event2 = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action'
        }
      });
      document.dispatchEvent(event2);

      expect(controller.onTestAction).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid turbo:before-stream-render event detail:',
        expect.any(Object)
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
  });

  describe('Event attributes', () => {
    it('should pass render attributes to handler', () => {
      MockController.streamActions = {
        'test_action': 'onTestAction'
      };

      useStreamActions(controller);
      controller.connect();

      const mockGetAttribute = vi.fn()
        .mockReturnValueOnce('modal-123')
        .mockReturnValueOnce('large');

      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'test_action',
          render: {
            target: document.body,
            getAttribute: mockGetAttribute,
            innerHTML: '<div>test content</div>'
          }
        },
        cancelable: true
      });

      document.dispatchEvent(event);

      expect(controller.onTestAction).toHaveBeenCalledTimes(1);
      const streamData = controller.onTestAction.mock.calls[0][0];
      expect(streamData.target).toBe(document.body);
      expect(streamData.event).toBe(event);
      expect(typeof streamData.get).toBe('function');
      expect(typeof streamData.getBoolean).toBe('function');
      expect(typeof streamData.getNumber).toBe('function');
      expect(typeof streamData.getJSON).toBe('function');
      expect(streamData.content).toBe('<div>test content</div>');
      expect(typeof streamData.attributes).toBe('object');
    });
  });
});