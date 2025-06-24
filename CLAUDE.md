# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript library that provides controller-scoped Turbo Stream Actions for Stimulus. It solves the problem of global `StreamActions` pollution by allowing custom Turbo Stream actions to be defined directly on Stimulus controllers with automatic cleanup.

The library intercepts `turbo:before-stream-render` events and routes them to the appropriate controller methods based on the action name, preventing the need to pollute the global `StreamActions` object.

## Development Commands

### Build & Development
- `npm run build` - Build the library using Vite
- `npm run clean` - Remove dist directory
- `npm run prepare` - Runs automatically before publishing (builds the project)

### Testing
- `npm test` - Run unit tests with Vitest
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:e2e` - Run end-to-end tests with Playwright

### Code Quality
- `npm run lint` - Lint TypeScript files in src/ (expects some @typescript-eslint/no-explicit-any warnings)
- `npm run lint:fix` - Auto-fix linting issues
- `npm run type-check` - Type check without emitting files

## Architecture

### Core Components

**StreamActionRegistry (Singleton)**
- Manages all controllers that have stream actions
- Listens to `turbo:before-stream-render` events at document level
- Routes actions to appropriate controller methods
- Automatically adds/removes document listener based on registered controllers

**Stream Action Configuration**
- String format: `'action_name': 'methodName'` (preventDefault: true by default)
- Object format: `'action_name': { method: 'methodName', preventDefault: false }`

### Lifecycle Integration
- `useStreamActions(controller)` patches controller connect/disconnect methods
- On connect: registers controller with StreamActionRegistry
- On disconnect: unregisters controller from StreamActionRegistry
- Registry automatically manages document event listener lifecycle

### Event Flow
1. Turbo dispatches `turbo:before-stream-render` event
2. StreamActionRegistry.handleStreamRender processes the event
3. Registry iterates through registered controllers
4. If controller has matching action, calls the method with `(target, event)` parameters
5. Method can access stream attributes via `event.detail.render.getAttribute()`

## Key Implementation Details

### Controller Registration
Controllers are registered/unregistered using a Set for O(1) operations. The registry uses a singleton pattern to ensure only one document listener is active.

### Event Prevention
By default, stream actions prevent the default Turbo behavior (`preventDefault: true`). This can be overridden per action to allow both custom and default behavior.

### Attribute Access
Stream action handlers receive the render target and event. Attributes from the `<turbo-stream>` element are accessed via `event.detail.render.getAttribute('attribute-name')`.

## Usage Patterns

### Static Declaration
```javascript
static streamActions = {
  'close_modal': 'closeModal',
  'update_cart': { method: 'updateCart', preventDefault: false }
};
```

### Handler Method Signature
```javascript
closeModal(target, event) {
  const modalId = event.detail.render.getAttribute('modal-id');
  // Handle the action
}
```

### Server-side Integration
Works with any server framework that generates `<turbo-stream>` elements with custom action attributes.

## Testing Strategy

### Unit Tests
- Test StreamActionRegistry singleton behavior
- Test controller registration/unregistration
- Test event routing and method calling
- Test preventDefault behavior

### E2E Tests
- Test real browser integration with Turbo
- Test multiple controllers with different actions
- Test controller lifecycle (connect/disconnect)
- Test attribute passing from server to client

## Build Configuration

- **Vite**: Handles TypeScript compilation and bundling
- **Output**: Dual format (ESM + UMD) in `dist/`
- **Types**: Generated TypeScript definitions
- **Target**: ES2020 with ESNext modules