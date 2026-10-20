#   docker build --build-arg BASE=tgci-oracle-ext -f docker/swiftshader/Dockerfile.ex -t tgci-ex-lavapipe:arm64 .
#   docker build --build-arg BASE=tgci-swiftshader-oracle-ext:arm64 -f docker/swiftshader/Dockerfile.ex -t tgci-ex-swiftshader:arm64 .
ARG BASE
FROM ${BASE}
WORKDIR /work/webgpu-poc
COPY typegpu-examples ./typegpu-examples
COPY docker/in-container ./docker/in-container
