#!/bin/sh
set -eux
apt-get update && apt-get install -y --no-install-recommends gnupg curl ca-certificates
mkdir -p /etc/apt/keyrings
curl -fsSL "https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xEB8B81E14DA65431D7504EA8F63F0F2B90935439" -o /tmp/kisak.asc
gpg --show-keys --with-colons /tmp/kisak.asc | grep '^fpr' | tee /kisak-key-fingerprints.txt
grep -q EB8B81E14DA65431D7504EA8F63F0F2B90935439 /kisak-key-fingerprints.txt
sha256sum /tmp/kisak.asc > /kisak-key.sha256
gpg --dearmor < /tmp/kisak.asc > /etc/apt/keyrings/kisak.gpg
printf 'Types: deb\nURIs: https://ppa.launchpadcontent.net/kisak/kisak-mesa/ubuntu\nSuites: noble\nComponents: main\nSigned-By: /etc/apt/keyrings/kisak.gpg\n' > /etc/apt/sources.list.d/kisak.sources
