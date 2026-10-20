#   docker build -f docker/e2/Dockerfile -t tgci-e2 .
FROM ubuntu:24.04
ARG NODE_VERSION=24.21.0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils \
      mesa-vulkan-drivers libvulkan1 vulkan-tools \
    && rm -rf /var/lib/apt/lists/*
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) na=x64;; arm64) na=arm64;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vitest.config.mts step2.test.ts step3.test.ts ./
