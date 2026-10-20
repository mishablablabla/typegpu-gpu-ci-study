FROM ubuntu:24.04
ARG NODE_VERSION=24.21.0
ARG WEBGPU_VERSION=0.6.2
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils \
      mesa-vulkan-drivers libvulkan1 vulkan-tools \
    && rm -rf /var/lib/apt/lists/*
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) na=x64;; arm64) na=arm64;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
WORKDIR /work
RUN npm init -y >/dev/null && npm install --no-audit --no-fund "webgpu@${WEBGPU_VERSION}"
COPY step1.mjs /work/step1.mjs
