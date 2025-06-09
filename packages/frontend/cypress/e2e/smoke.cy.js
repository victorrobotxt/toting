describe('smoke flow without reloads', () => {
  it('navigates via client-side links', () => {
    cy.visit('/');
    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });

    cy.contains('View Solana Chart').click();
    cy.url().should('include', '/solana');

    // --- FIX: Wait for the content of the Solana page to render before proceeding ---
    // This ensures the page transition is complete and the app is stable.
    // We check for the <canvas> element that the Recharts library uses to draw the chart.
    cy.get('canvas', { timeout: 10000 }).should('be.visible');

    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });
    
    cy.get('nav a[href="/login"]').click();
    cy.url().should('include', '/login');

    // --- FIX: Add an assertion to wait for the login page content ---
    cy.contains('h1', 'Login').should('be.visible');

    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });
  });
});
