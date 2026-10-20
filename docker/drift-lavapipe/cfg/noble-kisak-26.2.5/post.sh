#!/bin/sh
set -eux
ls /usr/share/vulkan/icd.d/
rm -v /usr/share/vulkan/icd.d/powervr_mesa_icd.json
