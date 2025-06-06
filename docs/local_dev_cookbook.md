# Local-Dev Cookbook

This guide provides setup instructions for a standard Windows environment using Docker Desktop with the WSL backend. **All `docker-compose` and `git` commands should be run from a standard terminal like PowerShell or Git Bash in your project's root directory (e.g., `D:\toting\`).**

## Quickstart

1.  **Copy Environment File**:
    From your project root in PowerShell, copy the example environment file.
    ```powershell
    cp .env.example .env
    ```

2.  **Initialize Git Submodules**:
    This step is **critical** and downloads the smart contract dependencies. It must be run from your host machine.
    ```powershell
    # In PowerShell, from your project root
    git submodule update --init --recursive
    ```
    *Verify this step by checking that the `D:\toting\lib\openzeppelin-contracts` directory is now populated with files.*

3.  **Start Core Services**:
    This starts the Anvil blockchain and mounts your project directory into the container.
    ```powershell
    # In PowerShell, from your project root
    docker-compose up -d anvil
    ```

4.  **Deploy Contracts**:
    Execute the setup script **inside the `anvil` container**.
    ```powershell
    # In PowerShell, from your project root
    docker-compose exec anvil /app/scripts/setup_env.sh
    ```
    If this step succeeds, continue to step 5. If it fails with a "file not found" error, please proceed to the **Troubleshooting** section below.

5.  **Start All Remaining Services**:
    ```powershell
    # In PowerShell, from your project root
    docker-compose up -d
    ```

6.  **Access the App**:
    The frontend will be available at `http://localhost:3000`.

## Troubleshooting

### "Error: ... contracts not found in /app/lib/." on Windows

This is a common issue with Docker Desktop on Windows where file changes on the host (like initializing submodules) are not correctly reflected in the container's volume mount.

Follow these steps to perform a hard reset:

1.  **Stop and Remove Everything:**
    This command will stop all containers and, importantly, remove the associated anonymous volumes where old data might be cached.
    ```powershell
    # In PowerShell, from your project root
    docker-compose down -v
    ```

2.  **Restart Docker Desktop:**
    Click the Docker icon in your system tray and select "Restart". This often clears up file-sharing and caching issues. Wait for it to turn green again.

3.  **Verify Submodules Again:**
    Just to be sure, run the submodule update command again.
    ```powershell
    git submodule update --init --recursive
    ```

4.  **Retry the Setup Process:**
    Now, start again from step 3 of the Quickstart guide.
    ```powershell
    docker-compose up -d anvil
    docker-compose exec anvil /app/scripts/setup_env.sh
    ```

If the problem still persists, run this diagnostic command to see what the container's file system looks like. The `lib` directory should not be empty.
```powershell
docker-compose exec anvil ls -lR /app/lib
