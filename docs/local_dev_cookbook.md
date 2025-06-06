# Local-Dev Cookbook

## Quickstart

1.  Copy `.env.example` to `.env` and fill in any necessary values.
2.  Start the Anvil chain to have an RPC endpoint available:
    ```bash
    docker-compose up -d anvil
    # Wait a few seconds for Anvil to start
    sleep 5 
    ```
3.  Run the setup script to deploy contracts and generate the environment file:
    ```bash
    ./scripts/setup_env.sh
    ```
4.  Start all other services:
    ```bash
    docker-compose up -d
    ```
5.  The frontend will be available at `http://localhost:3000`.