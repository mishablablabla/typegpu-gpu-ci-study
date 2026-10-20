#   docker build -f docker/cts/Dockerfile -t tgci-cts .   (add --platform linux/amd64 only for an EMULATED run)
FROM ubuntu:24.04
ARG NODE_VERSION=24.21.0
ARG CTS_COMMIT=e325d0bcc2cb785c4eab1d908339019215bd9462
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils git \
      mesa-vulkan-drivers libvulkan1 vulkan-tools \
    && rm -rf /var/lib/apt/lists/*
RUN arch="$(dpkg --print-architecture)"; case "$arch" in amd64) na=x64;; arm64) na=arm64;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
WORKDIR /work/webgpu-poc
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
WORKDIR /work/webgpu-poc/third_party
RUN git clone --filter=blob:none https://github.com/gpuweb/cts.git cts \
 && git -C cts checkout --detach "$CTS_COMMIT" \
 && test "$(git -C cts rev-parse HEAD)" = "$CTS_COMMIT" \
 && cd cts && npm ci --ignore-scripts --no-audit --no-fund && npm run node
COPY third_party/poc-specs/harness_grid_remainder.spec.ts /work/webgpu-poc/third_party/cts/src/webgpu/shader/execution/expression/binary/
COPY third_party/poc-specs/harness-mod-grid.json /work/webgpu-poc/third_party/poc-specs/harness-mod-grid.json
ENV HARNESS_GRID=/work/webgpu-poc/third_party/poc-specs/harness-mod-grid.json
COPY third_party/package.json third_party/dawn-node-provider.js third_party/adapter-probe.js third_party/run-cts.sh ./
RUN cd cts && ./tools/run_node --list 'webgpu:shader,execution,expression,binary,harness_grid_remainder:*' | head -3
