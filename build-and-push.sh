#!/bin/bash

# Build and Push Script for Connection Tester
# Usage: ./build-and-push.sh [registry] [tag]

set -e

# Configuration
DEFAULT_REGISTRY="docker.io"
DEFAULT_USERNAME="your-username"
DEFAULT_IMAGE_NAME="connection-tester"
DEFAULT_TAG="latest"

# Get parameters or use defaults
REGISTRY=${1:-$DEFAULT_REGISTRY}
TAG=${2:-$DEFAULT_TAG}

# Construct full image name
if [[ "$REGISTRY" == "docker.io" ]]; then
    # Docker Hub format: docker.io/username/image
    IMAGE_NAME="${DEFAULT_USERNAME}/${DEFAULT_IMAGE_NAME}"
    FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"
else
    # Other registries: registry.io/image
    FULL_IMAGE="${REGISTRY}/${DEFAULT_IMAGE_NAME}:${TAG}"
fi

echo "=========================================="
echo "Building and Pushing Docker Image"
echo "=========================================="
echo "Registry: $REGISTRY"
echo "Image: $FULL_IMAGE"
echo "=========================================="
echo ""

# Step 1: Build the image
echo "Step 1: Building Docker image..."
docker build -t "$FULL_IMAGE" .

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Step 2: Test the image (optional)
read -p "Do you want to test the image locally? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting container on port 3000..."
    echo "Press Ctrl+C to stop the test container"
    docker run -p 3000:3000 "$FULL_IMAGE" &
    CONTAINER_PID=$!
    sleep 3
    echo "Container is running. Visit http://localhost:3000"
    echo "Press Enter to stop the container and continue..."
    read
    docker stop $(docker ps -q --filter ancestor="$FULL_IMAGE") 2>/dev/null || true
    echo "Container stopped."
    echo ""
fi

# Step 3: Push the image
echo "Step 2: Pushing image to registry..."
echo "You may be prompted for registry credentials..."

docker push "$FULL_IMAGE"

if [ $? -ne 0 ]; then
    echo "❌ Push failed!"
    echo "Make sure you're logged in to the registry:"
    echo "  - Docker Hub: docker login"
    echo "  - ACR: az acr login --name <registry-name>"
    echo "  - GCR: gcloud auth configure-docker"
    exit 1
fi

echo "✅ Push successful!"
echo ""
echo "=========================================="
echo "Next Steps:"
echo "=========================================="
echo "1. Update k8s/deployment.yaml:"
echo "   Replace: image: YOUR_DOCKER_REPO/connection-tester:latest"
echo "   With:    image: $FULL_IMAGE"
echo ""
echo "2. Deploy to Kubernetes using the portal:"
echo "   - Apply k8s/service.yaml"
echo "   - Apply k8s/deployment.yaml"
echo "   - Apply k8s/ingress.yaml (optional)"
echo ""
echo "See DEPLOYMENT.md for detailed instructions."
echo "=========================================="
