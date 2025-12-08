# Deployment Guide

This guide will help you build, publish, and deploy the Connection Tester application to your Kubernetes cluster.

## Prerequisites

- Docker installed and running
- Access to a Docker registry (Docker Hub, Azure Container Registry, Google Container Registry, etc.)
- Kubernetes cluster access via portal
- kubectl (optional, if you need to verify deployments)

## Step 1: Build Docker Image

### Option A: Using Docker CLI (if available)

1. **Set your Docker registry and image name:**
   ```bash
   export DOCKER_REPO=your-registry.io/your-username
   export IMAGE_NAME=connection-tester
   export IMAGE_TAG=latest
   ```

2. **Build the image:**
   ```bash
   docker build -t $DOCKER_REPO/$IMAGE_NAME:$IMAGE_TAG .
   ```

3. **Test the image locally (optional):**
   ```bash
   docker run -p 3000:3000 $DOCKER_REPO/$IMAGE_NAME:$IMAGE_TAG
   ```
   Visit `http://localhost:3000` to verify it works.

### Option B: Using Docker Desktop or GUI

1. Open Docker Desktop or your Docker GUI tool
2. Navigate to the project directory
3. Build the image using the Dockerfile
4. Tag it with your registry: `your-registry.io/your-username/connection-tester:latest`

## Step 2: Push Image to Docker Registry

### Docker Hub

```bash
# Login to Docker Hub
docker login

# Push the image
docker push $DOCKER_REPO/$IMAGE_NAME:$IMAGE_TAG
```

### Azure Container Registry (ACR)

```bash
# Login to ACR
az acr login --name <your-registry-name>

# Tag for ACR
docker tag $IMAGE_NAME:$IMAGE_TAG <your-registry-name>.azurecr.io/$IMAGE_NAME:$IMAGE_TAG

# Push to ACR
docker push <your-registry-name>.azurecr.io/$IMAGE_NAME:$IMAGE_TAG
```

### Google Container Registry (GCR)

```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Tag for GCR
docker tag $IMAGE_NAME:$IMAGE_TAG gcr.io/<your-project-id>/$IMAGE_NAME:$IMAGE_TAG

# Push to GCR
docker push gcr.io/<your-project-id>/$IMAGE_NAME:$IMAGE_TAG
```

### Other Registries

Follow your registry's specific instructions for authentication and pushing images.

## Step 3: Update Kubernetes Manifests

Before deploying, update the image reference in `k8s/deployment.yaml`:

1. Open `k8s/deployment.yaml`
2. Find the line: `image: YOUR_DOCKER_REPO/connection-tester:latest`
3. Replace `YOUR_DOCKER_REPO` with your actual Docker registry path
   - Example: `docker.io/username/connection-tester:latest`
   - Example: `myregistry.azurecr.io/connection-tester:latest`
   - Example: `gcr.io/my-project/connection-tester:latest`

## Step 4: Configure Image Pull Secrets (if needed)

If your Docker registry requires authentication, you'll need to create a Kubernetes secret:

### Using kubectl (if available):

```bash
kubectl create secret docker-registry regcred \
  --docker-server=<your-registry-url> \
  --docker-username=<your-username> \
  --docker-password=<your-password> \
  --docker-email=<your-email> \
  --namespace=<your-namespace>
```

Then update `k8s/deployment.yaml` to include:

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
      - name: regcred
      containers:
      ...
```

### Using Kubernetes Portal:

1. Navigate to your namespace
2. Go to "Secrets" section
3. Create a new secret of type "Docker Registry"
4. Enter your registry credentials
5. Note the secret name and update the deployment manifest accordingly

## Step 5: Deploy to Kubernetes via Portal

### Using Kubernetes Portal UI:

1. **Deploy the Service:**
   - Navigate to your Kubernetes cluster in the portal
   - Go to "Services" or "Workloads"
   - Click "Create" or "Deploy"
   - Copy and paste the contents of `k8s/service.yaml`
   - Apply the configuration

2. **Deploy the Deployment:**
   - Navigate to "Deployments" or "Workloads"
   - Click "Create" or "Deploy"
   - Copy and paste the contents of `k8s/deployment.yaml`
   - Make sure the image path matches your Docker registry
   - Apply the configuration

3. **Deploy the Ingress (Optional):**
   - If you need external access, navigate to "Ingress"
   - Copy and paste the contents of `k8s/ingress.yaml`
   - Update the `host` field to match your domain
   - Update `ingressClassName` if you're using a different ingress controller
   - Apply the configuration

### Alternative: Using YAML Import

Most Kubernetes portals allow you to:
1. Navigate to "Import YAML" or "Apply Manifest"
2. Copy the entire contents of each YAML file
3. Paste and apply

## Step 6: Verify Deployment

1. **Check Pod Status:**
   - In the portal, navigate to "Pods"
   - Verify that pods with label `app: connection-tester` are running
   - Check logs if any pods are in "Error" or "CrashLoopBackOff" state

2. **Check Service:**
   - Navigate to "Services"
   - Verify `connection-tester-service` is created and has endpoints

3. **Access the Application:**
   - If using Ingress, access via the configured hostname
   - If using port-forward (via kubectl): `kubectl port-forward service/connection-tester-service 3000:80`
   - Access via cluster-internal DNS: `http://connection-tester-service.<namespace>.svc.cluster.local`

## Troubleshooting

### Image Pull Errors

- Verify the image exists in your registry
- Check image pull secrets are configured correctly
- Verify the image path in deployment.yaml matches your registry

### Pod Not Starting

- Check pod logs in the portal
- Verify resource limits aren't too restrictive
- Check if the image is accessible from the cluster

### Service Not Accessible

- Verify service selector matches deployment labels
- Check if port mappings are correct
- Verify ingress configuration if using external access

## Updating the Application

1. Build a new Docker image with a new tag (e.g., `v1.0.1`)
2. Push the new image to your registry
3. Update `k8s/deployment.yaml` with the new image tag
4. Apply the updated deployment in the Kubernetes portal
5. Kubernetes will automatically perform a rolling update

## Configuration

### Environment Variables

You can add environment variables to the deployment by editing the `env` section in `k8s/deployment.yaml`:

```yaml
env:
- name: NODE_ENV
  value: "production"
- name: CUSTOM_VAR
  value: "custom-value"
```

### Resource Limits

Adjust CPU and memory limits in `k8s/deployment.yaml` based on your cluster's resources and application needs.

### Replicas

Change the number of replicas in `k8s/deployment.yaml` to scale your application:

```yaml
spec:
  replicas: 3  # Change this number
```
