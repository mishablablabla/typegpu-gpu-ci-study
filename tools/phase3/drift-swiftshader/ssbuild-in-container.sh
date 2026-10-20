#!/bin/sh
set -u; O=/out; mkdir -p $O; T0=$(date +%s); lg() { echo "$(date -u +%FT%TZ) +$(( $(date +%s)-T0 ))s $*" | tee -a $O/build.log; }
SS_SHA="${SS_SHA:?}"; BACKEND="${BACKEND:-LLVM}"; nproc | sed 's/^/nproc /' >> $O/build.log
mkdir -p /src && cd /src && git init -q ss && cd ss && git remote add origin https://swiftshader.googlesource.com/SwiftShader && git fetch -q --depth 1 origin $SS_SHA && git checkout -q FETCH_HEAD && [ "$(git rev-parse HEAD)" = "$SS_SHA" ] && lg "fetched $SS_SHA" || { lg "FETCH FAILED"; exit 3; }
git submodule status > $O/submodules.txt 2>&1; lg "submodules: $(wc -l < $O/submodules.txt)"; cat $O/submodules.txt >> $O/build.log
for m in $(git config -f .gitmodules --get-regexp path | awk '{print $2}'); do case $m in third_party/llvm-project|third_party/PowerVR_Examples|third_party/benchmark|third_party/git-hooks|third_party/googletest) continue;; esac; git submodule update --init --depth 1 -- $m >> $O/build.log 2>&1 || lg "submodule $m FAILED"; done; lg "submodules fetched"
ls third_party >> $O/build.log; du -sh /src/ss | tee -a $O/build.log
cmake -S . -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++ -DREACTOR_BACKEND=$BACKEND -DSWIFTSHADER_BUILD_TESTS=OFF -DSWIFTSHADER_BUILD_BENCHMARKS=OFF -DSWIFTSHADER_BUILD_PVR=OFF -DSWIFTSHADER_BUILD_CPPDAP=OFF -DSWIFTSHADER_BUILD_EGL=OFF -DSWIFTSHADER_BUILD_GLESv2=OFF -DSWIFTSHADER_BUILD_GLES_CM=OFF -DSWIFTSHADER_BUILD_WSI_XCB=OFF -DSWIFTSHADER_BUILD_WSI_WAYLAND=OFF -DSWIFTSHADER_WARNINGS_AS_ERRORS=OFF -DSWIFTSHADER_BUILD_VULKAN=ON > $O/cmake.log 2>&1; lg "cmake exit $?"
cmake --build /build --target vk_swiftshader -- -j${JOBS:-2} > $O/ninja.log 2>&1; rc=$?; lg "ninja exit $rc"; tail -5 $O/ninja.log >> $O/build.log
find /build -name 'libvk_swiftshader.so' -o -name 'vk_swiftshader_icd.json' | tee -a $O/build.log
for f in $(find /build -name 'libvk_swiftshader.so' -o -name 'vk_swiftshader_icd.json'); do cp $f $O/; done; sha256sum $O/libvk_swiftshader.so $O/vk_swiftshader_icd.json >> $O/build.log 2>&1; lg "done"
