#   docker build --build-arg SS_ARCH=arm64 -f docker/swiftshader/Dockerfile.cts -t tgci-swiftshader-cts:arm64 .
FROM ubuntu:24.04
ARG NODE_VERSION=24.21.0
ARG CTS_COMMIT=e325d0bcc2cb785c4eab1d908339019215bd9462
ARG SS_ARCH
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils git libvulkan1 vulkan-tools file && rm -rf /var/lib/apt/lists/*
RUN arch="$(dpkg --print-architecture)"; [ "$arch" = "$SS_ARCH" ] || { echo "SS_ARCH mismatch (emulation is not evidence)"; exit 1; }; \
    case "$arch" in amd64) na=x64;; arm64) na=arm64;; esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${na}.tar.xz" | tar -xJ -C /usr/local --strip-components=1
COPY docker/swiftshader/icd/extract-${SS_ARCH}/usr/lib/chromium/libvk_swiftshader.so docker/swiftshader/icd/extract-${SS_ARCH}/usr/lib/chromium/vk_swiftshader_icd.json /opt/swiftshader/
RUN ! dpkg -s mesa-vulkan-drivers >/dev/null 2>&1 && ! ls /usr/share/vulkan/icd.d/lvp_icd* >/dev/null 2>&1 \
 && [ -z "$(ls /usr/share/vulkan/icd.d /etc/vulkan/icd.d 2>/dev/null | grep -v '^$' | grep -v ':$')" ] && echo "image check ok: no other ICD manifests"
ENV VK_DRIVER_FILES=/opt/swiftshader/vk_swiftshader_icd.json VK_ICD_FILENAMES=/opt/swiftshader/vk_swiftshader_icd.json VK_LOADER_DRIVERS_SELECT=vk_swiftshader_icd.json
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
COPY third_party/package.json third_party/dawn-node-provider.js third_party/adapter-probe.js ./
COPY tools/phase2/run-cts-swiftshader.sh ./run-cts-swiftshader.sh
COPY docker/in-container /work/webgpu-poc/docker/in-container
RUN cd cts && ./tools/run_node --list 'webgpu:shader,execution,expression,binary,harness_grid_remainder:*' | head -3
