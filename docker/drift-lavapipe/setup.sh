#!/bin/sh
set -eux
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
rm -f /etc/apt/sources.list.d/ubuntu.sources /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources
cp /cfg/snapshot.sources /etc/apt/sources.list.d/snapshot.sources
printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "5";\n' > /etc/apt/apt.conf.d/99drift
[ -f /cfg/extra.sh ] && sh /cfg/extra.sh
apt-get update
MESA=mesa-vulkan-drivers; [ -f /cfg/mesa.version ] && MESA="mesa-vulkan-drivers=$(cat /cfg/mesa.version)"   # explicit older version from an older pocket (all pockets of the release stay enabled so base packages do not conflict)
TARGET=""; [ -f /cfg/apt.target ] && TARGET="-t $(cat /cfg/apt.target)"   # e.g. backports: dependencies are then taken from that suite as needed
apt-get install -y --no-install-recommends $TARGET curl xz-utils git file "$MESA" libvulkan1 vulkan-tools $(cat /cfg/extra.pkgs 2>/dev/null)
[ -f /cfg/post.sh ] && sh /cfg/post.sh   # optional per-config workaround hook (documented in the config's NOTE)
rm -rf /var/lib/apt/lists/*
