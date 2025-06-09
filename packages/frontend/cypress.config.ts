import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: false,
    // --- THIS IS THE FIX ---
    // The pattern is now relative to this config file's location (packages/frontend).
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  },
});