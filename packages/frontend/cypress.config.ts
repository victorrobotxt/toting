import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:3000',
    supportFile: false,
    // --- FIX: Make the pattern relative to the *project root*, not the config file's location. ---
    specPattern: 'packages/frontend/cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
  },
});
