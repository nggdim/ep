# Kubernetes Deployment Files

This directory contains the Kubernetes manifests for deploying the Connection Tester application.

## Files

- **deployment.yaml** - Main application deployment with 2 replicas, health checks, and resource limits
- **service.yaml** - ClusterIP service to expose the application within the cluster
- **ingress.yaml** - Ingress configuration for external access (optional)

## Quick Deploy Checklist

1. ✅ Build Docker image: `docker build -t your-registry/connection-tester:latest .`
2. ✅ Push to registry: `docker push your-registry/connection-tester:latest`
3. ✅ Update `deployment.yaml` line 18: Replace `YOUR_DOCKER_REPO` with your actual registry path
4. ✅ (If private registry) Create image pull secret in Kubernetes portal
5. ✅ Deploy Service via portal (copy/paste `service.yaml`)
6. ✅ Deploy Deployment via portal (copy/paste `deployment.yaml`)
7. ✅ (Optional) Deploy Ingress via portal (copy/paste `ingress.yaml`)

## Customization

### Change Replica Count
Edit `deployment.yaml`:
```yaml
spec:
  replicas: 3  # Change this number
```

### Change Resource Limits
Edit `deployment.yaml`:
```yaml
resources:
  requests:
    memory: "512Mi"  # Adjust as needed
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

### Change Service Type
Edit `service.yaml` to use `NodePort` or `LoadBalancer`:
```yaml
spec:
  type: LoadBalancer  # or NodePort
```

### Update Ingress Host
Edit `ingress.yaml`:
```yaml
rules:
- host: your-domain.com  # Change this
```

## Image Pull Secrets

If using a private registry, add to `deployment.yaml`:

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
      - name: your-registry-secret
      containers:
      ...
```

Create the secret in Kubernetes portal first, then reference it here.
