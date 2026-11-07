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

CH32V307 和 CH32V305 的标称主频是 144 MHz。SWD 由 GPIO 软件产生，速度与主频成正比，所以 `wdap` 和 `v305` 跑在 216 MHz；芯片在这个主频下温度较高，可能出现重启。`wdap-144` 和 `v305-144` 是同一块板子跑在标称主频的版本。各板的引脚、指示灯和按键见 [docs/boards.md](docs/boards.md)。

## 烧录和升级

每个发布版本为每种固件提供一个压缩包 `xrdap-ch32-<固件>.zip`，其中有启动链 `boot-chain.bin`、应用 `xrdap.elf.bin`、两个引导槽的镜像、升级脚本 `dfu_update.py` 和 `LICENSE`。

新板子先写入启动链。启动链由地址 0 的 stage1 和一个 USB DFU bootloader 组成，可以用 WCH-Link 写入，例如用 MounRiver Studio 带的 WCH OpenOCD 和本仓库的 `tools/wch-riscv.cfg`：

```
openocd -f tools/wch-riscv.cfg -c init -c halt -c "flash erase_sector wch_riscv.flash 0 last" -c "program boot-chain.bin 0x00000000 verify" -c "reset run" -c shutdown
```

`v305`、`linkw`、没有焊调试排针的板子和装着旧版固件的板子另有写法，见 [docs/boot.md](docs/boot.md)。

此后升级只需要 USB 线。`dfu_update.py` 让运行中的探针重启进入 bootloader，写入应用后启动它；`--bootloader-dir` 同时升级 bootloader，接了多块探针时用 `--serial` 选择：

```
pip install pyusb libusb-package
python dfu_update.py --bootloader-dir . xrdap.elf.bin
```

dfu-util 同样可以写入，命令见 [docs/boot.md](docs/boot.md)。上电时按住板上的 bootloader 键，bootloader 停在 DFU 模式，不启动应用。

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

增加一种板子需要新建 `boards/<板子>/`，并在 `CMakePresets.json` 中加一个 preset。

## 许可证

Apache-2.0。`chips/` 下 WCH 的文件（启动文件、`Core`、`Peripheral`）保留各自的许可证。`boards/linkw/v208_radio.hpp` 派生自 [ch32fun](https://github.com/cnlohr/ch32fun) 的 iSLER，同时带有它的 MIT 声明。
