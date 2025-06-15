describe('Full E2E Flow: Create Election and Vote', () => {
  // Use a valid JSON string for the metadata that matches the frontend's expectations
  const electionMeta = JSON.stringify({
    title: `E2E Test Election @ ${Date.now()}`,
    description: 'A test election created by Cypress.',
    options: [
      { id: 'opt_a', label: 'A' },
      { id: 'opt_b', label: 'B' },
    ],
  });
  const electionId = 0; // The first election created will have ID 0

  // Helper to fetch the predicted wallet address for the mock voter
  function getPredictedWallet() {
    return cy
      .exec("grep NEXT_PUBLIC_WALLET_FACTORY ../../.env.deployed | cut -d '=' -f2")
      .then(({ stdout }) => {
        const factory = stdout.trim();
        return cy.exec('cast wallet address --mnemonic mnemonic.txt').then(({ stdout }) => {
          const owner = stdout.trim();
          return cy
            .exec(
              `cast call --rpc-url http://localhost:8545 ${factory} \"getAddress(address,uint256)(address)\" ${owner} 0`
            )
            .then(({ stdout }) => stdout.trim());
        });
      });
  }

  it('allows an admin to create an election and a user to vote in it via AA', () => {
    // --- 1. Admin logs in and creates the election ---
    cy.visit('/');
    cy.get('nav a[href="/login"]').click();
    cy.url().should('include', '/login');

    // Use the mock login for the admin
    cy.contains('button', 'Mock Login').click();
    cy.get('input#mock-email').type('admin@example.com');
    cy.get('div[role="dialog"]').contains('button', 'Login').click();
    cy.url().should('include', '/dashboard');

    // Navigate to create an election
    cy.contains('a', 'Create Election').click();
    cy.url().should('include', '/elections/create');

    // Fill out the creation form, using the valid metadata JSON
    cy.get('textarea[placeholder*="metadata json"]').type(electionMeta, {
      parseSpecialCharSequences: false,
    });
    
    // The test was missing steps to submit the form. Assuming a simple flow.
    cy.contains('button', 'Create Election').click();

    // Verify redirection to the new election's page
    cy.url().should('include', `/elections/${electionId}`);
    cy.contains(`Election ${electionId}`).should('be.visible');

    // --- 2. Admin opens the election for voting ---
    cy.get('select').select('open');
    cy.contains('button', 'Submit').click();
    cy.contains('Status: open', { timeout: 10000 }).should('be.visible');

    // --- 3. Log out and log in as a regular voter ---
    cy.get('button[aria-label="Account menu"]').click();
    cy.contains('button', 'Logout').click();
    cy.url().should('include', '/login');

    cy.contains('button', 'Mock Login').click();
    cy.get('input#mock-email').type('voter@e2e.test');
    cy.get('div[role="dialog"]').contains('button', 'Login').click();
    cy.url().should('include', '/dashboard');

    // Assert the smart wallet starts with zero ETH balance
    getPredictedWallet().then((wallet) => {
      cy.wrap(wallet).as('wallet');
      return cy.exec(`cast balance --rpc-url http://localhost:8545 ${wallet}`).its('stdout');
    }).then((balance) => {
      expect(balance.trim()).to.eq('0');
    });

    // --- 4. Voter navigates to the election and casts a vote ---
    cy.contains('a', `${electionId}`).click();
    cy.url().should('include', `/elections/${electionId}`);

    // Click the link to go to the voting page
    cy.contains('a', 'Vote').click();
    cy.url().should('include', `/vote?id=${electionId}`);

    // Select an option and cast the vote using the correct button label
    cy.contains('button', 'Vote for B').click();

    // --- 5. Verify the AA flow completes ---
    // The most important check: The UserOperation was successfully sent.
    // We give it a long timeout to allow for proofs and bundling.
    cy.contains('UserOp Hash:', { timeout: 30000 }).should('be.visible');
    cy.contains(/0x[a-fA-F0-9]{64}/)
      .should('be.visible')
      .invoke('text')
      .then((txt) => {
        const hash = txt.match(/0x[a-fA-F0-9]{64}/)?.[0];
        if (hash) {
          cy.wrap(hash).as('userOpHash');
        }
      });

    // --- 6. Validate on-chain state via cast ---
    cy.get('@wallet').then((wallet) => {
      cy.exec(`cast code --rpc-url http://localhost:8545 ${wallet}`).its('stdout').then((code) => {
        expect(code.trim()).to.not.eq('0x');
      });
    });

    cy.exec("grep NEXT_PUBLIC_ELECTION_MANAGER ../../.env.deployed | cut -d '=' -f2").then(({ stdout }) => {
      const manager = stdout.trim().toLowerCase();
      return cy
        .exec(
          "cast rpc --rpc-url http://localhost:8545 eth_getBlockByNumber latest true | jq -r '.transactions[-1].hash'"
        )
        .then(({ stdout }) => stdout.trim())
        .then((txHash) => {
          return cy.exec(`cast receipt --rpc-url http://localhost:8545 ${txHash}`).then(({ stdout }) => {
            expect(stdout.toLowerCase()).to.include(manager.slice(2));
            expect(stdout).to.include('status: 0x1');
          });
        });
    });
  });
});
