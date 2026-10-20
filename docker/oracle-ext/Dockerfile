#   docker build -f docker/oracle-ext/Dockerfile -t tgci-oracle-ext .
FROM ubuntu:24.04
ARG NODE_VERSION=24.21.0
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils mesa-vulkan-drivers libvulkan1 vulkan-tools && rm -rf /var/lib/apt/lists/*
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) na=x64;; arm64) na=arm64;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
WORKDIR /work/webgpu-poc
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY vitest.config.mts harness.ts step1.mjs ./
COPY lib ./lib
COPY diff ./diff
COPY ported ./ported
COPY third_party/adapter-probe.js third_party/dawn-node-provider.js third_party/package.json ./third_party/
COPY evaluator/engine-allrows.ts ./evaluator/
COPY evaluator/dump-bits-ext.test.ts evaluator/dump-bits-ext-f16.test.ts evaluator/vitest.config.mts ./evaluator/
