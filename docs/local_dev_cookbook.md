# Local-Dev Cookbook

## Quickstart

```bash
git clone <repo>
cd toting
# Build images and start services
docker-compose up -d
# wait 60 s
open http://localhost:3000
```

Docker builds rely on `.dockerignore` to keep contexts small. If you add large directories make sure they're excluded to avoid build failures.
