import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('console', message => console.log(`Browser: ${message.text()}`));
});

test('Turbo and the controller become ready', async ({ page }) => {
  await page.goto('/tests/e2e/stimulus-stream-actions');

  await expect(page.locator('#turbo-check')).toHaveText('Turbo Ready');
  await expect(page.locator('#controller-check')).toHaveText('Controller Ready');
  await expect(page.locator('#action-log')).toContainText('Test controller initialized with action: test_action');
});

test('custom action is routed to the controller with its attributes', async ({ page }) => {
  await page.goto('/tests/e2e/stimulus-stream-actions');
  await expect(page.locator('#controller-check')).toHaveText('Controller Ready');

  await page.evaluate(() => window.triggerTestAction('e2e_test_payload'));

  await expect(page.locator('#action-log')).toContainText('Event: turbo:before-stream-render');
  await expect(page.locator('#action-log')).toContainText('SUCCESS: handleTestAction called with payload: e2e_test_payload');
});

// These assert the LIBRARY performs the DOM work: the stream is handed to real
// Turbo, the controller handler (which preventDefaults Turbo's native render)
// is what mutates the DOM. No fallback code runs in the test.
test.describe('base action overrides perform the DOM work', () => {
  const newItem = '<div id="new-item">New Item</div>';

  async function ready(page) {
    await page.goto('/tests/e2e/stimulus-stream-actions');
    await expect(page.locator('#controller-check')).toHaveText('Controller Ready');
    await expect(page.locator('#item-1')).toBeVisible();
  }

  test('append', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'append', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom append called');
    await expect(page.locator('#item-1')).toContainText('Item 1');
    await expect(page.locator('#item-1 #new-item')).toHaveText('New Item');
  });

  test('prepend', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'prepend', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom prepend called');
    await expect(page.locator('#item-1 #new-item')).toHaveText('New Item');
  });

  test('update', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'update', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom update called');
    await expect(page.locator('#item-1')).toHaveText('New Item');
  });

  test('replace', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'replace', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom replace called');
    await expect(page.locator('#new-item')).toBeVisible();
    await expect(page.locator('#item-1')).toHaveCount(0);
  });

  test('remove', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => window.injectTurboStream({ action: 'remove', target: 'item-1' }));

    await expect(page.locator('#action-log')).toContainText('Custom remove called');
    await expect(page.locator('#item-1')).toHaveCount(0);
  });

  test('before', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'before', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom before called');
    await expect(page.locator('#new-item')).toBeVisible();
    await expect(page.locator('#item-1')).toBeVisible();
  });

  test('after', async ({ page }) => {
    await ready(page);
    await page.evaluate(html => window.injectTurboStream({ action: 'after', target: 'item-1', html }), newItem);

    await expect(page.locator('#action-log')).toContainText('Custom after called');
    await expect(page.locator('#new-item')).toBeVisible();
    await expect(page.locator('#item-1')).toBeVisible();
  });
});
