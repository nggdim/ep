# Connection Tester

This repository contains a db-less Next.js application that is used to validate API/JDBC/ODBC connectivity inside a local Kubernetes cluster.

## Local Development

```bash
npm install
npm run dev
```

The UI is available at [http://localhost:3000](http://localhost:3000).

## Build & Publish the Docker Image

The repo already contains a multi-stage `Dockerfile` optimized for `next start`.

1. Authenticate to your registry (Docker Hub shown here):

   ```bash
   docker login --username <your-user>
   ```

2. Build the production image:

   ```bash
   docker build -t <registry>/<repo>/connection-tester:1.0.0 .
   ```

3. Push the image so the Kubernetes cluster can pull it:

   ```bash
   docker push <registry>/<repo>/connection-tester:1.0.0
   ```

   Update the tag whenever you publish a new build.

## Kubernetes Manifests

- `k8s/nextjs-connection-tester.yaml` defines both the `Deployment` and `Service`.
  - Update the `image:` field to the tag you pushed above.
  - The Service is of type `NodePort` (default `32080 -> 3000`). Adjust if your cluster supports `LoadBalancer`.

### Deploy via Kubernetes Dashboard (no CLI required)

1. Sign in to the dashboard, click the **+** button in the top-right corner, and choose **Create from YAML**.
2. Paste the contents of `k8s/nextjs-connection-tester.yaml`, replace `REPLACE_WITH_YOUR_IMAGE`, and click **Deploy**.
3. To redeploy a new version, update the YAML with the new image tag and click **Upload** again; the Deployment performs a rolling restart.
4. If your image lives in a private registry, first create a secret under **Config & Storage ➜ Secrets ➜ Create ➜ Docker Registry** and add `imagePullSecrets` to the Deployment pod spec.

### Accessing the App

- Use the Kubernetes Dashboard **Services** page to view `nextjs-docker-app`.
- Note the assigned NodePort (default `32080`). Access it via `http://<worker-node-ip>:32080`.
- If you change the Service type to `LoadBalancer`, use the external IP/hostname exposed by your local cluster (for example, `minikube service nextjs-docker-app --url`).

## File Reference

- `Dockerfile` – multi-stage Node 20 build/run image.
- `.dockerignore` – trims build context for faster Docker builds.
- `k8s/nextjs-connection-tester.yaml` – Deployment + Service manifest ready for the Kubernetes dashboard.
