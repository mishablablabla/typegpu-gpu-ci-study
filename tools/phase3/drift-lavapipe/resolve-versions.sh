#!/bin/bash
cd "$(dirname "$0")/../../.." || exit 2
n=$1; base=$2; D="$PWD/docker/drift-lavapipe"
docker run --rm -v "$D:/d:ro" "$base" sh -c "mkdir -p /cfg && cp -R /d/cfg/$n/. /cfg/ && sh /d/setup.sh >/tmp/setup.log 2>&1; echo setup-exit=\$?; tail -3 /tmp/setup.log; dpkg-query -W -f='\${Package} \${Version}\n' mesa-vulkan-drivers 'libllvm*' libvulkan1 vulkan-tools libdrm2 libc6 libstdc++6 2>&1 | grep -v 'no packages'; vulkaninfo --summary 2>&1 | grep -E 'deviceName|driverInfo|apiVersion' | head"
