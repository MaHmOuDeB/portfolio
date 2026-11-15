// The README's question cells of the Pulse event table that carry a dash, and the same words in plain
// punctuation, as the page prints them (a plain module, so the end-to-end tests can read it too).
export const PLAIN_QUESTIONS: Readonly<Record<string, string>> = {
  'Activation — did the user reach the core screen this session?': 'Activation: did the user reach the core screen this session?',
  'Feature engagement — which chart drives deeper investigation?': 'Feature engagement: which chart drives deeper investigation?',
  'Conversion to an outside-the-product action — a strong intent signal.':
    'Conversion to an action outside the product, a strong sign of intent.',
  'Retention driver — saving a view predicts the user will come back.': 'Retention driver: saving a view predicts the user will come back.',
};
