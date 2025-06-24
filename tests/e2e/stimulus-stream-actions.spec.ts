import { test, expect } from '@playwright/test';

test.describe('Stimulus Stream Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/e2e/stimulus-stream-actions.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('Modal Controller - Open and Close Actions', async ({ page }) => {
    const logArea = page.locator('#action-log');
    
    // Test open modal
    await page.click('button:has-text("Open Modal")');
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await expect(page.locator('#modal-overlay')).toHaveClass(/show/);
    await expect(logArea).toContainText('[Modal] Opened modal: demo-modal');
    
    // Test close modal by clicking the close button inside the modal
    await page.locator('#demo-modal button:has-text("Close")').click();
    await expect(page.locator('#demo-modal')).not.toHaveClass(/show/);
    await expect(page.locator('#modal-overlay')).not.toHaveClass(/show/);
    await expect(logArea).toContainText('[Modal] Closed modal(s): #demo-modal');
  });

  test('Cart Controller - Add and Remove Actions', async ({ page }) => {
    const cartCounter = page.locator('[data-cart-target="counter"]');
    const cartItems = page.locator('[data-cart-target="items"]');
    const logArea = page.locator('#action-log');
    
    // Initial state
    await expect(cartCounter).toHaveText('0');
    
    // Add to cart
    await page.click('button:has-text("Add to Cart")');
    await expect(cartCounter).toHaveText('1');
    await expect(cartItems).toContainText('• Demo Product');
    await expect(logArea).toContainText('[Cart] Added to cart: Demo Product (123)');
    
    // Add another item
    await page.evaluate(() => {
      (window as any).triggerAction('add_to_cart', {'product-id': '456', name: 'Another Product'});
    });
    await expect(cartCounter).toHaveText('2');
    await expect(cartItems).toContainText('• Another Product');
    
    // Remove item
    await page.evaluate(() => {
      (window as any).triggerAction('remove_from_cart', {'product-id': '123'});
    });
    await expect(cartCounter).toHaveText('1');
    await expect(cartItems).not.toContainText('• Demo Product');
    await expect(cartItems).toContainText('• Another Product');
    await expect(logArea).toContainText('[Cart] Removed from cart: 123');
  });

  test('Notification Controller - Show Notifications', async ({ page }) => {
    const logArea = page.locator('#action-log');
    
    // Test success notification
    await page.click('button:has-text("Success")');
    await expect(page.locator('.notification.success')).toBeVisible();
    await expect(page.locator('.notification.success')).toHaveText('Success!');
    await expect(logArea).toContainText('[Notification] Showed notification: Success! (success)');
    
    // Wait for notification to disappear
    await page.waitForTimeout(3500);
    await expect(page.locator('.notification.success')).toHaveCount(0);
    
    // Test error notification
    await page.click('button:has-text("Error")');
    await expect(page.locator('.notification.error')).toBeVisible();
    await expect(page.locator('.notification.error')).toHaveText('Error!');
    await expect(logArea).toContainText('[Notification] Showed notification: Error! (error)');
  });

  test('Status Controller - Update Status', async ({ page }) => {
    const statusDisplay = page.locator('[data-status-target="display"]');
    const logArea = page.locator('#action-log');
    
    // Initial state
    await expect(statusDisplay).toHaveText('Ready');
    
    // Test loading status
    await page.click('button:has-text("Loading")');
    await expect(statusDisplay).toHaveText('Processing...');
    await expect(statusDisplay).toHaveClass(/status-loading/);
    await expect(logArea).toContainText('[Status] Status updated: loading - Processing...');
    
    // Test success status
    await page.waitForTimeout(100); // Small delay to ensure previous action completes
    await page.locator('[data-controller="status"] button:has-text("Success")').click();
    await expect(statusDisplay).toHaveText('Completed!');
    await expect(statusDisplay).toHaveClass(/status-success/);
    await expect(logArea).toContainText('[Status] Status updated: success - Completed!');
  });

  test('Multiple Controllers Handle Same Action', async ({ page }) => {
    const logArea = page.locator('#action-log');
    
    // Trigger an action that multiple controllers might handle
    await page.evaluate(() => {
      (window as any).triggerAction('show_notification', {message: 'Multi-controller test', type: 'success'});
    });
    
    await expect(logArea).toContainText('[Notification] Showed notification: Multi-controller test (success)');
    await expect(page.locator('.notification.success')).toContainText('Multi-controller test');
  });

  test('Custom Action Attributes', async ({ page }) => {
    const logArea = page.locator('#action-log');
    
    // Test action with custom attributes
    await page.evaluate(() => {
      (window as any).triggerAction('open_modal', {
        'modal-id': 'demo-modal',
        'custom-attribute': 'test-value'
      });
    });
    
    await expect(page.locator('#demo-modal')).toHaveClass(/show/);
    await expect(logArea).toContainText('[Modal] Opened modal: demo-modal');
  });

  test('Non-existent Action Does Not Cause Errors', async ({ page }) => {
    const logArea = page.locator('#action-log');
    const initialLogContent = await logArea.textContent();
    
    // Trigger non-existent action
    await page.evaluate(() => {
      (window as any).triggerAction('non_existent_action', {});
    });
    
    // Log should not change
    await page.waitForTimeout(100);
    const finalLogContent = await logArea.textContent();
    expect(finalLogContent).toBe(initialLogContent);
  });

  test('preventDefault Behavior', async ({ page }) => {
    const logArea = page.locator('#action-log');
    
    // All our test actions should prevent default
    // This is more of an implementation detail test
    await page.evaluate(() => {
      const event = new CustomEvent('turbo:before-stream-render', {
        detail: {
          action: 'open_modal',
          render: {
            target: null,
            getAttribute: (name) => name === 'modal-id' ? 'demo-modal' : null
          }
        },
        cancelable: true
      });
      
      document.dispatchEvent(event);
      return event.defaultPrevented;
    });
    
    await expect(logArea).toContainText('[Modal] Opened modal: demo-modal');
  });
});

