describe('smoke flow without reloads', () => {
  it('navigates via client-side links', () => {
    cy.visit('/');
    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });
    cy.contains('View Solana Chart').click();
    cy.url().should('include', '/solana');
    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });
    cy.get('nav a[href="/login"]').click();
    cy.url().should('include', '/login');
    cy.window().then((win) => {
      expect(win.performance.getEntriesByType('navigation').length).to.eq(1);
    });
  });
});
