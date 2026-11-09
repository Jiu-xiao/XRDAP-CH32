# XRDAP-CH32

[English](README.en.md)

XRDAP-CH32 是运行在沁恒 CH32V307、CH32V305 和 CH32V208 上的 CMSIS-DAP v2 调试探针固件，基于 [libxr](https://github.com/xrobot-org/libxr)，属于 XR-DAP 系列。Keil、pyOCD、probe-rs、OpenOCD 把它当作普通的 CMSIS-DAP 探针使用。两块带射频的探针可以组成一套无线探针，一块插在电脑上，另一块接目标。固件还实现了 XR 厂商扩展，配合电脑端工具 [XRDAP-Host](https://github.com/Jiu-xiao/XRDAP-Host) 读写变量、在探针上按固定周期采样变量。XR-DAP 各探针共用的代码在 [XRDAP-Core](https://github.com/Jiu-xiao/XRDAP-Core)。

## 板子

| 固件 | 板子 | 芯片与主频 | USB | 无线 |
|---|---|---|---|---|
| `wdap` | 高速无线 DAP 调试器 | CH32V307RCT6，216 MHz | 高速 480 Mbit/s | SX1281 模块 |
| `wdap-144` | 同上 | CH32V307RCT6，144 MHz | 高速 480 Mbit/s | SX1281 模块 |
| `v305` | CH32V305 板（电路同 WCH-LinkE） | CH32V305FBP6，216 MHz | 高速 480 Mbit/s | 无 |
| `v305-144` | 同上 | CH32V305FBP6，144 MHz | 高速 480 Mbit/s | 无 |
| `linkw` | WCH-LinkW-R0-1v1 | CH32V208GBU6，144 MHz | 全速 12 Mbit/s | 芯片自带射频 |

CH32V307 和 CH32V305 的标称主频是 144 MHz。SWD 由 GPIO 软件产生，速度与主频成正比，所以 `wdap` 和 `v305` 运行在 216 MHz；芯片在这个主频下温度较高，可能出现重启。`wdap-144` 和 `v305-144` 是同一块板子运行在标称主频的版本。各板的引脚、指示灯和按键见 [docs/boards.md](docs/boards.md)。

## 烧录和升级

每个发布版本提供以下文件。`<固件>` 为 `wdap`、`wdap-144`、`v305`、`v305-144` 或 `linkw`；`<板子>` 为 `wdap`、`v305` 或 `linkw`，同一块板子两种主频的固件共用这块板子的启动文件。

| 文件 | 内容 | 用途 |
|---|---|---|
| `xrdap-ch32-<固件>.bin` | 固件 | 每次升级 |
| `xrdap-ch32-<板子>-bootloader-a.bin`、`xrdap-ch32-<板子>-bootloader-b.bin` | bootloader 两个槽的镜像 | 升级 bootloader，发布说明写明是否需要 |
| `xrdap-ch32-<板子>-boot-chain.bin` | 启动链：stage1 和一份 bootloader | 新板子第一次写入 |
| `xrdap-ch32-<板子>-migrate-to-ab.bin` | 迁移镜像（`linkw` 没有） | 装着 0.6 之前 bootloader 的板子改用新的启动链 |
| `SHA256SUMS` | 以上文件的校验和 | |

升级固件只需要 USB 线和浏览器：在 Chrome 或 Edge 中打开 [XR-DAP CH32 固件升级](https://jiu-xiao.github.io/XRDAP-CH32/)页面，选择固件文件，点击“开始写入”，在设备列表中选择探针。页面让探针重启进入 bootloader 并写入固件，探针随后启动新固件；浏览器第一次遇到某块探针的 bootloader 时需要再授权一次。勾选“同时升级 bootloader”并选择两个槽的镜像时，页面先依次写入两个槽，再写入固件。dfu-util 和本仓库的 `tools/dfu_update.py` 同样可以写入，命令见 [docs/boot.md](docs/boot.md)。

新板子先写入启动链。WCH-Link 可以写入，例如用 MounRiver Studio 带的 WCH OpenOCD 和本仓库的 `tools/wch-riscv.cfg` 写入 `wdap` 的启动链：

```
openocd -f tools/wch-riscv.cfg -c init -c halt -c "flash erase_sector wch_riscv.flash 0 last" -c "program xrdap-ch32-wdap-boot-chain.bin 0x00000000 verify" -c "reset run" -c shutdown
```

写入后 bootloader 停在 DFU 模式，再按上面的方法写入固件。`v305`、`linkw`（包括原厂的 WCH-LinkE、WCH-LinkW）、没有焊调试排针的板子和装着旧版固件的板子另有写法，见 [docs/boot.md](docs/boot.md)。

上电时按住板上的 bootloader 键，bootloader 停在 DFU 模式，不启动固件；固件无法启动或写入中断时，用这种方式进入 bootloader 后重新写入。

探针在电脑上是 USB 设备 `1D50:6199`，序列号为 `XRobot-XRDAP-` 加芯片 UID；bootloader 是 `1209:3072`。Linux 上加入以下 udev 规则后，普通用户可以访问两者：

```
SUBSYSTEM=="usb", ATTR{idVendor}=="1d50", ATTR{idProduct}=="6199", MODE="0666"
SUBSYSTEM=="usb", ATTR{idVendor}=="1209", ATTR{idProduct}=="3072", MODE="0666"
```

## 无线调试

两块 `wdap` 或两块 `linkw` 可以组成一套无线探针，两块板烧写同一个固件。使用前先配对：在 10 s 内先后在两块板上按住配对键 3 s（`wdap` 为 KEY2，`linkw` 为 ModeS）。配对结果保存在 Flash 中，断电和升级后仍然有效。配对参数用于区分不同的探针对，不做认证。

角色默认自动决定。已配对的探针在没有自己的调试会话时作为远端，在无线上等待；电脑上的调试工具向其中一块发出 DAP_Connect 时，这块探针先寻找已配对的远端，找到后这次会话的 DAP 命令经无线在远端的 SWD 口上执行，找不到时它作为普通的有线探针工作。因此只供电的那块是远端，接电脑的那块是主机端；电脑一侧的用法与有线探针相同。

角色（自动、有线、主机端、远端）、空中速率（高、低）和信道（自动或锁定）保存在 Flash 的设置区，用控制口请求修改，见 XRDAP-Core 的 [`docs/protocol.md`](https://github.com/Jiu-xiao/XRDAP-Core/blob/main/docs/protocol.md) 第 8 节，那里也说明了无线链路的包格式、会话和信道规则。`wdap` 用 SX1281 模块，`linkw` 用芯片自带的射频，两种板子的空中格式不同，只能与同种板子配对。

## 变量读写与采样

XR 厂商扩展让一条命令读写多个地址、沿指针链解引用，并由探针按固定周期采样变量，周期不受 USB 往返延迟的影响。`xrdap` 的 `read`、`write` 和 `watch` 使用这些命令：

```
xrdap read --elf app.elf motor.speed motor.state
xrdap watch --elf app.elf motor.speed motor.current --period 1ms --csv log.csv
```

无线调试时这些命令同样转发给远端，采样在远端进行。命令格式见 XRDAP-Core 的 `docs/protocol.md` 第 3 节。

## 性能

下表为 CH32V307 板和 WCH-LinkW 在 0.6.0（`0.6.0+g303d983`）下的测量结果。主机为 Windows 11，目标为 STM32H723（`linkw` 两行为 STM32F302CB），测试程序为 XRDAP-Core 的 [`tests/`](https://github.com/Jiu-xiao/XRDAP-Core/tree/main/tests)（bce599e）。`linkw` 无线一行在 SWD 请求 20 MHz 下测量，其余各行 SWD 请求 50 MHz 时读写全部正确，各项在这一请求下测量。小变量读写是用厂商扩展命令读、写一个 4 字节 SRAM 变量的往返时间中位数；块读写在 SRAM 中写入、读出 16 KiB，流水读同时有 4 个请求在途；OpenOCD 和 probe-rs 0.31 读目标 Flash 128 KiB，probe-rs 一列扣除了连接时间；采样周期是 `xrdap watch` 采样 8 个 SRAM 变量、连续 60 s 不跳拍不丢帧的最短周期。

| 固件 | 连接 | 小变量读 / 写 | 块写 / 读 / 流水读 | OpenOCD 读 128 KiB | probe-rs 读 128 KiB | 8 个变量采样最短周期 |
|---|---|---|---|---|---|---|
| `wdap`（216 MHz） | 有线 | 139 / 148 µs | 736 / 762 / 1081 KiB/s | 0.13 s | 约 0.13 s | 400 µs |
| `wdap-144` | 有线 | 125 / 125 µs | 588 / 625 / 730 KiB/s | 0.19 s | 约 0.19 s | 800 µs |
| `wdap-144` | 无线 | 771 / 771 µs | 96 / 97 / 93 KiB/s | 1.27 s | - | 800 µs |
| `linkw` | 有线 | 184 / 192 µs | 332 / 351 / 391 KiB/s | 0.21 s | 约 0.31 s | 250 µs |
| `linkw` | 无线 | 621 / 622 µs | 104 / 105 / 113 KiB/s | 1.28–1.40 s | - | 800 µs |

`wdap` 一行的块读写在电脑空闲时测量；`linkw` 无线一行的两块板并排放置；无线两行没有测 probe-rs。

## 编译

编译需要 CMake 3.21 以上和 WCH RISC-V GCC 15.2 以上（`riscv32-wch-elf-gcc` 在 `PATH` 中，或用 `-DCOMPILER_PREFIX=<路径>/riscv32-wch-elf-` 指定）。每种固件对应 `CMakePresets.json` 中的一个 preset，一个 preset 编出应用和这块板的启动链：

```
git clone --recursive https://github.com/Jiu-xiao/XRDAP-CH32.git
cd XRDAP-CH32
cmake --preset wdap
cmake --build --preset wdap
```

应用在 `build/wdap/xrdap.elf.bin`，启动链在 `build/wdap/bootloader/`。`tools/build.sh` 编译全部 preset，镜像收集在 `build/images/<preset>/`；CI 在 `xrimage/xrimage-ch32-riscv` 容器中运行它，推送 `v*` 标签时生成发布草稿。

Flash 布局、引导槽规则、目标复位脚、采样节拍和 `linkw` 的射频驱动有编译机上的测试：

```
cmake -S tests -B build/tests
cmake --build build/tests
ctest --test-dir build/tests
```

升级网页的 DFU 部分用 Node 测试：`node --test web/test/dfu.test.mjs`。

版本号是 `cmake/xrdap.cmake` 中的 `XRDAP_VERSION`，编译时附加提交号，例如 `0.6.0+g2ec5b8e`。

## 目录

| 目录 | 内容 |
|---|---|
| `boards/<板子>/` | 一块板的全部文件：`board.cmake`（芯片系列、晶振、主频、Flash 布局、部件源文件）、`board.hpp`（引脚、指示灯、SWD 时序）、`board.cpp`（组装探针和部件，运行主循环），以及只有这块板使用的部件 |
| `chips/<系列>/` | 一个芯片系列的 WCH SDK、启动文件、时钟和 USB 定义，以及编译参数 `chip.cmake`；链接脚本 `chips/Link.ld` 两个系列共用 |
| `app/` | 各板共用的应用部分：探针 `probe`、部件接口 `part`、采样节拍、设置、看门狗 |
| `bootloader/` | stage1、DFU bootloader 和迁移镜像，单独的 CMake 工程，由应用工程调用 |
| `common/` | 应用和 bootloader 共用的定义：Flash 布局、引导槽记录、时钟 |
| `cmake/xrdap.cmake` | 两个工程共用的编译设置、默认值和版本号 |
| `tests/` | 编译机上的测试 |
| `tools/` | 编译脚本、升级脚本、启动链打包脚本、WCH OpenOCD 配置 |
| `web/` | 固件升级网页（WebUSB DFU），发布到 GitHub Pages；`web/test/` 用 Node 测试其中的 DFU 部分 |

增加一种板子需要新建 `boards/<板子>/`，并在 `CMakePresets.json` 中加一个 preset。

## 许可证

Apache-2.0。`chips/` 下 WCH 的文件（启动文件、`Core`、`Peripheral`）保留各自的许可证。`boards/linkw/v208_radio.hpp` 派生自 [ch32fun](https://github.com/cnlohr/ch32fun) 的 iSLER，同时带有它的 MIT 声明。
