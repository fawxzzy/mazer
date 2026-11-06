import type { TutorialRegistry } from './tutorialRegistry.ts';

/**
 * EXAMPLE CONTENT ONLY. These tokens are placeholders that show the data shape and exercise the registry and
 * acknowledgement store. They are not the product's tutorial list, the copy keys do not exist in any copy table,
 * and no UI consumes this file. Replace with owner-approved content before any tutorial UI ships.
 */
export const EXAMPLE_TUTORIAL_REGISTRY: TutorialRegistry = Object.freeze({
  schemaVersion: 1,
  tokens: Object.freeze([
    {
      id: 'example.welcome',
      trigger: { kind: 'account-created' },
      repeat: 'once',
      revision: 1,
      order: 0,
      copy: {
        titleKey: 'example.tutorial.welcome.title',
        bodyKey: 'example.tutorial.welcome.body',
        continueKey: 'example.tutorial.continue'
      }
    },
    {
      id: 'example.first-goal',
      trigger: { kind: 'first-occurrence', event: 'goal-reached' },
      repeat: 'once',
      revision: 1,
      order: 10,
      copy: {
        titleKey: 'example.tutorial.first-goal.title',
        bodyKey: 'example.tutorial.first-goal.body',
        continueKey: 'example.tutorial.continue'
      }
    },
    {
      id: 'example.tip-of-the-day',
      trigger: { kind: 'first-occurrence', event: 'menu-opened' },
      repeat: 'repeatable',
      revision: 1,
      order: 20,
      copy: {
        titleKey: 'example.tutorial.tip.title',
        bodyKey: 'example.tutorial.tip.body',
        continueKey: 'example.tutorial.continue'
      }
    }
  ])
}) as TutorialRegistry;
